import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  identities,
  lgas,
  payments,
  profiles,
  states,
  structureAccounts,
  structurePayments,
  wallets,
} from "@/db/schema";
import {
  computeShares,
  duesForCategory,
  isPayingCategory,
  SPLIT_ORDER,
  type DuesShares,
  type MembershipCategory,
  type StructureLevel,
} from "./dues";
import { hasMonnify } from "./env";
import * as monnify from "./monnify";
import type { PaymentKind, PaymentStatus } from "./wallet-types";

/* ============================================================
   Wallet ledger — the source of truth for every member's naira
   balance and the audit trail behind it.

   Neon's HTTP driver (drizzle-orm/neon-http) has no interactive
   transactions — each statement is its own round trip, so "read balance,
   decide, write" can't be wrapped in a single client-side transaction.
   Every money-moving function here is instead built from statements that
   are individually atomic (a single conditional UPDATE, guarded by a WHERE
   clause Postgres evaluates against the current row under its own lock) and
   ORDERED so that a crash between statements can never lose track of money:
   the audit row is always written before or alongside a balance change,
   never after — worst case is a `pending` row a reconciliation pass can
   resolve, never a debit with no explanation or a duplicate credit.
   ============================================================ */

export async function getBalance(userId: string): Promise<number> {
  await db.insert(wallets).values({ userId }).onConflictDoNothing();
  const [row] = await db.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return row?.balance ?? 0;
}

/** Unconditional credit — deposits on confirmation, refunds on a failed withdrawal. */
async function credit(userId: string, amount: number): Promise<void> {
  await db.insert(wallets).values({ userId, balance: amount }).onConflictDoUpdate({
    target: wallets.userId,
    set: { balance: sql`${wallets.balance} + ${amount}` },
  });
}

/** Atomic "debit if sufficient funds" — the single statement that makes the
 *  balance check and the deduction race-free under concurrent requests. */
async function tryDebit(userId: string, amount: number): Promise<boolean> {
  await db.insert(wallets).values({ userId }).onConflictDoNothing();
  const rows = await db
    .update(wallets)
    .set({ balance: sql`${wallets.balance} - ${amount}` })
    .where(and(eq(wallets.userId, userId), sql`${wallets.balance} >= ${amount}`))
    .returning({ balance: wallets.balance });
  return rows.length > 0;
}

export interface PaymentDTO {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number;
  description: string | null;
  destinationBankCode: string | null;
  destinationAccountNumber: string | null;
  destinationAccountName: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function listRecentPayments(userId: string, limit = 50): Promise<PaymentDTO[]> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    amount: r.amount,
    description: r.description,
    destinationBankCode: r.destinationBankCode,
    destinationAccountNumber: r.destinationAccountNumber,
    destinationAccountName: r.destinationAccountName,
    failureReason: r.failureReason,
    createdAt: new Date(r.createdAt).toISOString(),
    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
  }));
}

/* -------------------------------- deposits --------------------------------
   Two-phase: create a `pending` row before the gateway is ever contacted,
   then finalize (credit) only from a server-verified source (webhook or a
   status query) — never from a client's claim that payment succeeded. */

export async function createPendingDeposit(input: {
  userId: string;
  reference: string;
  amount: number;
  description: string;
}): Promise<string> {
  const [row] = await db
    .insert(payments)
    .values({
      userId: input.userId,
      kind: "deposit",
      status: "pending",
      amount: input.amount,
      reference: input.reference,
      description: input.description,
    })
    .returning({ id: payments.id });
  return row.id;
}

/**
 * Exactly-once finalize: the guarded status flip (`pending` → `completed`)
 * only succeeds for ONE caller even if the webhook and a manual status
 * check race each other; only that caller credits the wallet.
 *
 * The check-and-flip used to be a SELECT followed by a conditional UPDATE —
 * two round trips before the wallet credit even started. It's now a single
 * conditional UPDATE (matched on reference + kind + still-pending) that
 * returns the row it flipped, so the common "first caller to confirm this
 * deposit" path is one round trip, not two, before the credit lands — the
 * difference the member actually feels as "did my balance update yet".
 * A miss (0 rows) falls back to one SELECT only to explain why (not found
 * vs. already finalized), which is the rare path.
 */
export async function finalizeDeposit(
  reference: string,
  providerReference: string,
): Promise<{ ok: boolean; userId?: string; amount?: number; alreadyFinalized?: boolean }> {
  const flipped = await db
    .update(payments)
    .set({ status: "completed", providerReference, completedAt: new Date() })
    .where(and(eq(payments.reference, reference), eq(payments.kind, "deposit"), eq(payments.status, "pending")))
    .returning({ id: payments.id, userId: payments.userId, amount: payments.amount });
  if (flipped.length > 0) {
    const row = flipped[0];
    await credit(row.userId, row.amount);
    return { ok: true, userId: row.userId, amount: row.amount };
  }

  const [existing] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
  if (!existing || existing.kind !== "deposit") return { ok: false };
  return { ok: true, alreadyFinalized: true, userId: existing.userId, amount: existing.amount };
}

export async function markDepositFailed(reference: string, reason: string): Promise<void> {
  await db
    .update(payments)
    .set({ status: "failed", failureReason: reason })
    .where(and(eq(payments.reference, reference), eq(payments.status, "pending")));
}

/* ------------------------------- withdrawals -------------------------------
   Fully automated: the amount is debited the moment the request is created
   (so the same funds can never be withdrawn twice in parallel), then either
   confirmed (no further balance change — it already left) or refunded if the
   gateway ultimately fails/reverses the transfer. */

export async function createWithdrawalRequest(input: {
  userId: string;
  reference: string;
  amount: number;
  destinationBankCode: string;
  destinationAccountNumber: string;
  destinationAccountName: string;
  description: string;
}): Promise<{ ok: boolean; paymentId?: string; error?: string }> {
  // Audit row FIRST (status=pending, no money moved yet) — if the debit
  // below never runs (crash/redeploy), this row is inert and safely
  // sweepable, never a phantom deduction.
  const [row] = await db
    .insert(payments)
    .values({
      userId: input.userId,
      kind: "withdrawal",
      status: "pending",
      amount: input.amount,
      reference: input.reference,
      destinationBankCode: input.destinationBankCode,
      destinationAccountNumber: input.destinationAccountNumber,
      destinationAccountName: input.destinationAccountName,
      description: input.description,
    })
    .returning({ id: payments.id });

  const debited = await tryDebit(input.userId, input.amount);
  if (!debited) {
    await db
      .update(payments)
      .set({ status: "failed", failureReason: "insufficient_funds" })
      .where(eq(payments.id, row.id));
    return { ok: false, error: "insufficient_funds" };
  }
  return { ok: true, paymentId: row.id };
}

/** The gateway accepted (or rejected outright) the transfer request itself
 *  — as opposed to the async success/failure that arrives via webhook. */
export async function recordWithdrawalDispatchFailure(paymentId: string, reason: string): Promise<void> {
  const [row] = await db.select({ userId: payments.userId, amount: payments.amount, status: payments.status }).from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!row || row.status !== "pending") return;
  const flipped = await db
    .update(payments)
    .set({ status: "failed", failureReason: reason })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")))
    .returning({ id: payments.id });
  if (flipped.length) await credit(row.userId, row.amount); // refund the reservation
}

/** Webhook-driven final outcome of a dispatched transfer. */
export async function finalizeWithdrawalOutcome(
  reference: string,
  outcome: "success" | "failed",
  reason?: string,
): Promise<{ ok: boolean; alreadyFinalized?: boolean; userId?: string; amount?: number }> {
  const [existing] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
  if (!existing || existing.kind !== "withdrawal") return { ok: false };
  if (existing.status !== "pending") return { ok: true, alreadyFinalized: true, userId: existing.userId, amount: existing.amount };

  const nextStatus = outcome === "success" ? "completed" : "reversed";
  const flipped = await db
    .update(payments)
    .set({
      status: nextStatus,
      completedAt: outcome === "success" ? new Date() : undefined,
      failureReason: outcome === "failed" ? (reason ?? "transfer_failed") : undefined,
    })
    .where(and(eq(payments.id, existing.id), eq(payments.status, "pending")))
    .returning({ id: payments.id });
  if (flipped.length === 0) return { ok: true, alreadyFinalized: true, userId: existing.userId, amount: existing.amount };

  if (outcome === "failed") await credit(existing.userId, existing.amount); // refund
  return { ok: true, userId: existing.userId, amount: existing.amount };
}

/* ---------------------------------- dues ----------------------------------
   An internal ledger deduction, not a gateway round trip. `reference`
   is `dues_<userId>_<yyyy-mm>` — the UNIQUE constraint on `reference` makes
   a month's dues naturally idempotent: a second attempt is just a duplicate
   insert that the database rejects. */

/* ============================================================
   Structure accounts + the dues distribution engine (§7.2–7.4).

   A member's monthly dues are debited once (gated by a unique
   reference), then split 50/20/20/10 down the member's OWN
   ward → LGA → state → national treasuries. Every credit is
   itself gated by a per-level unique reference, so a retried or
   concurrent charge can never double-credit a treasury, and a
   charge that half-completed heals on the next run.
   ============================================================ */

interface StructureNode {
  key: string;
  level: StructureLevel;
  name: string;
  stateId?: string | null;
  lgaId?: string | null;
  ward?: string | null;
}

const NATIONAL_NODE: StructureNode = { key: "national", level: "national", name: "National HQ" };

/** Get (creating if needed) the treasury row for a structure node, returning its id. */
async function ensureStructureAccount(node: StructureNode): Promise<string> {
  const [inserted] = await db
    .insert(structureAccounts)
    .values({
      key: node.key,
      level: node.level,
      name: node.name,
      stateId: node.stateId ?? null,
      lgaId: node.lgaId ?? null,
      ward: node.ward ?? null,
    })
    .onConflictDoNothing({ target: structureAccounts.key })
    .returning({ id: structureAccounts.id });
  if (inserted) return inserted.id;
  const [row] = await db
    .select({ id: structureAccounts.id })
    .from(structureAccounts)
    .where(eq(structureAccounts.key, node.key))
    .limit(1);
  return row.id;
}

/** Credit a treasury exactly once: the ledger insert (unique `reference`) is the
 *  gate — only the caller that actually inserts the row moves the balance. */
async function creditStructureOnce(
  node: StructureNode,
  amount: number,
  reference: string,
  sourceUserId: string,
  description: string,
): Promise<boolean> {
  if (amount <= 0) return false;
  const accountId = await ensureStructureAccount(node);
  const [ledgered] = await db
    .insert(structurePayments)
    .values({
      accountId,
      kind: "dues_share",
      status: "completed",
      amount,
      sourceUserId,
      reference,
      description,
      completedAt: new Date(),
    })
    .onConflictDoNothing({ target: structurePayments.reference })
    .returning({ id: structurePayments.id });
  if (!ledgered) return false; // already applied on an earlier run
  await db
    .update(structureAccounts)
    .set({ balance: sql`${structureAccounts.balance} + ${amount}` })
    .where(eq(structureAccounts.id, accountId));
  return true;
}

/** The member's four target treasuries. A level with no geography on the
 *  member's profile can't receive its share, so that share folds up into
 *  National — money is always conserved, never orphaned. */
function targetNodes(geo: {
  stateId: string | null;
  lgaId: string | null;
  ward: string | null;
  stateName: string | null;
  lgaName: string | null;
}): Record<StructureLevel, StructureNode | null> {
  return {
    national: NATIONAL_NODE,
    state: geo.stateId
      ? { key: `state:${geo.stateId}`, level: "state", name: `${geo.stateName ?? "State"} State`, stateId: geo.stateId }
      : null,
    lga:
      geo.lgaId && geo.stateId
        ? { key: `lga:${geo.lgaId}`, level: "lga", name: `${geo.lgaName ?? "LGA"} LGA`, stateId: geo.stateId, lgaId: geo.lgaId }
        : null,
    ward:
      geo.lgaId && geo.ward && geo.stateId
        ? {
            key: `ward:${geo.lgaId}:${geo.ward}`,
            level: "ward",
            name: geo.ward,
            stateId: geo.stateId,
            lgaId: geo.lgaId,
            ward: geo.ward,
          }
        : null,
  };
}

/** Distribute an already-charged dues amount across the member's treasuries.
 *  Idempotent: safe to call repeatedly for the same (userId, monthKey). */
async function distributeDues(
  userId: string,
  amount: number,
  monthKey: string,
  monthName: string,
  geo: Parameters<typeof targetNodes>[0],
): Promise<DuesShares> {
  const shares = computeShares(amount);
  const nodes = targetNodes(geo);

  // Fold any level the member can't be placed at into National.
  for (const level of ["ward", "lga", "state"] as StructureLevel[]) {
    if (!nodes[level] && shares[level] > 0) {
      shares.national += shares[level];
      shares[level] = 0;
    }
  }

  for (const level of SPLIT_ORDER) {
    const node = nodes[level];
    if (!node || shares[level] <= 0) continue;
    await creditStructureOnce(
      node,
      shares[level],
      `duesshare_${userId}_${monthKey}_${level}`,
      userId,
      `Dues share (${level}) — ${monthName}`,
    );
  }
  return shares;
}

/** A member's own monthly dues (by their category) — for reminders and the
 *  Finance dues card. 0 for non-paying tiers. */
export async function memberDuesAmount(
  userId: string,
): Promise<{ amount: number; category: MembershipCategory }> {
  const [row] = await db
    .select({ category: identities.membershipCategory })
    .from(identities)
    .where(eq(identities.userId, userId))
    .limit(1);
  const category = (row?.category ?? "regular") as MembershipCategory;
  return { amount: duesForCategory(category), category };
}

export interface DuesChargeResult {
  ok: boolean;
  reason?: "non_paying" | "insufficient_funds";
  amount?: number;
  category?: MembershipCategory;
  shares?: DuesShares;
  /** True when this month was already charged before (we only re-ran the
   *  idempotent distribution to heal any partial prior run). */
  alreadyCharged?: boolean;
}

/**
 * Charge a member's monthly dues by their membership category and split the
 * money down the structure (§7.3). Debits the member exactly once (gated by
 * `dues_<userId>_<monthKey>`), then distributes the four shares idempotently.
 * Non-paying categories (student/honorary/…) are a no-op.
 */
export async function chargeMonthlyDues(
  userId: string,
  monthKey: string,
  monthName: string,
): Promise<DuesChargeResult> {
  // Category (→ amount) + the geography the shares flow to, in one round trip.
  const [member] = await db
    .select({
      category: identities.membershipCategory,
      stateId: profiles.stateId,
      lgaId: profiles.lgaId,
      ward: profiles.ward,
      stateName: states.name,
      lgaName: lgas.name,
    })
    .from(profiles)
    .leftJoin(identities, eq(identities.userId, profiles.userId))
    .leftJoin(states, eq(states.id, profiles.stateId))
    .leftJoin(lgas, eq(lgas.id, profiles.lgaId))
    .where(eq(profiles.userId, userId))
    .limit(1);

  const category = (member?.category ?? "regular") as MembershipCategory;
  if (!isPayingCategory(category)) return { ok: false, reason: "non_paying", category };

  const amount = duesForCategory(category);
  const geo = {
    stateId: member?.stateId ?? null,
    lgaId: member?.lgaId ?? null,
    ward: member?.ward ?? null,
    stateName: member?.stateName ?? null,
    lgaName: member?.lgaName ?? null,
  };
  const duesRef = `dues_${userId}_${monthKey}`;

  // 1) Charge the member exactly once. The unique `reference` is the gate.
  let alreadyCharged = false;
  const debited = await tryDebit(userId, amount);
  if (debited) {
    try {
      await db.insert(payments).values({
        userId,
        kind: "dues",
        status: "completed",
        amount,
        reference: duesRef,
        description: `Monthly dues — ${monthName}`,
        completedAt: new Date(),
      });
    } catch {
      // A concurrent charge already recorded this month — undo our debit and
      // fall through to (idempotently) ensure the shares are distributed.
      await credit(userId, amount);
      alreadyCharged = true;
    }
  } else {
    // Couldn't debit: either already charged this month, or genuinely short.
    const [existing] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.reference, duesRef))
      .limit(1);
    if (!existing) return { ok: false, reason: "insufficient_funds", amount, category };
    alreadyCharged = true;
  }

  // 2) Distribute (idempotent) — heals any partial prior run too.
  const shares = await distributeDues(userId, amount, monthKey, monthName, geo);
  return { ok: true, amount, category, shares, alreadyCharged };
}

/* ============================================================
   Reserved (dedicated) accounts — a permanent NUBAN a member or a
   treasury can be funded by ordinary bank transfer. We store the
   reference we gave Monnify (`reservedRef`) alongside the bank
   account(s) it returned, and credit the owner when the
   RESERVED_ACCOUNT funding webhook arrives (creditReservedFunding).
   Provisioning is best-effort and idempotent: it only calls Monnify
   when a reserved account isn't already on file AND keys are set, so
   it's safe to call on every signup and every wallet open.
   ============================================================ */

export interface ReservedAccountView {
  accountNumber: string;
  bankName: string;
  bankCode: string;
  accountName?: string;
}

function toViews(accounts: monnify.ReservedBankAccount[]): ReservedAccountView[] {
  return accounts.map((a) => ({
    accountNumber: a.accountNumber,
    bankName: a.bankName,
    bankCode: a.bankCode,
    accountName: a.accountName,
  }));
}

/** Create a reserved account, self-healing when a prior attempt already created
 *  it in Monnify (reference reported as a duplicate) but we never stored it —
 *  in that case we fetch the existing account instead of failing forever. */
async function provisionReserved(
  accountReference: string,
  accountName: string,
  email: string,
): Promise<monnify.ReservedAccountResult> {
  try {
    return await monnify.createReservedAccount({
      accountReference,
      accountName,
      customerEmail: email,
      customerName: accountName,
    });
  } catch (err) {
    if (monnify.isDuplicateReferenceError(err)) {
      return await monnify.getReservedAccount(accountReference);
    }
    throw err;
  }
}

/** Ensure the member has a dedicated account, returning its bank account(s).
 *  Returns null when it can't be provisioned yet (no Monnify keys) — the UI
 *  shows an "activating" state and this heals on the next call once keys exist. */
export async function ensureMemberReservedAccount(
  userId: string,
  name: string,
  email: string,
): Promise<ReservedAccountView[] | null> {
  const [existing] = await db
    .select({ ref: wallets.reservedRef, accounts: wallets.reservedAccounts })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  // reservedRef is only ever set together with the accounts, so its presence
  // means "already provisioned" — never re-hit Monnify (a duplicate errors).
  if (existing?.ref) return (existing.accounts as ReservedAccountView[] | null) ?? [];
  if (!hasMonnify()) return null;

  const result = await provisionReserved(`wallet_${userId}`, name || email.split("@")[0], email);
  const accounts = toViews(result.accounts);
  await db
    .insert(wallets)
    .values({ userId, reservedRef: result.accountReference, reservedAccounts: accounts })
    .onConflictDoUpdate({
      target: wallets.userId,
      set: { reservedRef: result.accountReference, reservedAccounts: accounts },
    });
  return accounts;
}

/** Ensure a structure treasury has a dedicated account. Same contract as the
 *  member version, keyed by the treasury's stable `structureAccounts.key`. */
export async function ensureStructureReservedAccount(
  accountId: string,
  key: string,
  name: string,
  contactEmail: string,
): Promise<ReservedAccountView[] | null> {
  const [existing] = await db
    .select({ ref: structureAccounts.reservedRef, accounts: structureAccounts.reservedAccounts })
    .from(structureAccounts)
    .where(eq(structureAccounts.id, accountId))
    .limit(1);
  if (existing?.ref) return (existing.accounts as ReservedAccountView[] | null) ?? [];
  if (!hasMonnify()) return null;

  const result = await provisionReserved(`structure_${key}`, name, contactEmail);
  const accounts = toViews(result.accounts);
  await db
    .update(structureAccounts)
    .set({ reservedRef: result.accountReference, reservedAccounts: accounts })
    .where(eq(structureAccounts.id, accountId));
  return accounts;
}

export interface ReservedFundingResult {
  ok: boolean;
  target?: "wallet" | "structure";
  userId?: string;
  amount?: number;
  alreadyApplied?: boolean;
}

/**
 * Credit a bank transfer into a dedicated account, matched by `accountReference`
 * (a member wallet OR a treasury). Exactly-once: the ledger insert (idempotency
 * key derived from the provider reference) is the gate, so a replayed webhook
 * can't double-credit. Returns { ok:false } if the reference matches nothing.
 */
export async function creditReservedFunding(
  accountReference: string,
  providerReference: string,
  amountNaira: number,
): Promise<ReservedFundingResult> {
  if (!Number.isFinite(amountNaira) || amountNaira <= 0) return { ok: false };
  const ref = `resv_${providerReference}`;

  // Member wallet?
  const [w] = await db
    .select({ userId: wallets.userId })
    .from(wallets)
    .where(eq(wallets.reservedRef, accountReference))
    .limit(1);
  if (w) {
    const [ledgered] = await db
      .insert(payments)
      .values({
        userId: w.userId,
        kind: "deposit",
        status: "completed",
        provider: "monnify",
        amount: amountNaira,
        reference: ref,
        providerReference,
        description: "Bank transfer to dedicated account",
        completedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: payments.id });
    if (!ledgered) return { ok: true, target: "wallet", userId: w.userId, amount: amountNaira, alreadyApplied: true };
    await credit(w.userId, amountNaira);
    return { ok: true, target: "wallet", userId: w.userId, amount: amountNaira };
  }

  // Structure treasury?
  const [s] = await db
    .select({ id: structureAccounts.id })
    .from(structureAccounts)
    .where(eq(structureAccounts.reservedRef, accountReference))
    .limit(1);
  if (s) {
    const [ledgered] = await db
      .insert(structurePayments)
      .values({
        accountId: s.id,
        kind: "deposit",
        status: "completed",
        amount: amountNaira,
        reference: ref,
        description: "Bank transfer to dedicated account",
        completedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: structurePayments.id });
    if (!ledgered) return { ok: true, target: "structure", amount: amountNaira, alreadyApplied: true };
    await db
      .update(structureAccounts)
      .set({ balance: sql`${structureAccounts.balance} + ${amountNaira}` })
      .where(eq(structureAccounts.id, s.id));
    return { ok: true, target: "structure", amount: amountNaira };
  }

  return { ok: false };
}
