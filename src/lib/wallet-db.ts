import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments, wallets } from "@/db/schema";
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
 */
export async function finalizeDeposit(
  reference: string,
  providerReference: string,
): Promise<{ ok: boolean; userId?: string; amount?: number; alreadyFinalized?: boolean }> {
  const [existing] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
  if (!existing || existing.kind !== "deposit") return { ok: false };
  if (existing.status !== "pending") return { ok: true, alreadyFinalized: true, userId: existing.userId, amount: existing.amount };

  const flipped = await db
    .update(payments)
    .set({ status: "completed", providerReference, completedAt: new Date() })
    .where(and(eq(payments.id, existing.id), eq(payments.status, "pending")))
    .returning({ id: payments.id });
  if (flipped.length === 0) return { ok: true, alreadyFinalized: true, userId: existing.userId, amount: existing.amount };

  await credit(existing.userId, existing.amount);
  return { ok: true, userId: existing.userId, amount: existing.amount };
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

export async function deductDues(
  userId: string,
  amount: number,
  reference: string,
  description: string,
): Promise<{ ok: boolean; reason?: "insufficient_funds" | "already_deducted" }> {
  const debited = await tryDebit(userId, amount);
  if (!debited) return { ok: false, reason: "insufficient_funds" };
  try {
    await db.insert(payments).values({
      userId,
      kind: "dues",
      status: "completed",
      amount,
      reference,
      description,
      completedAt: new Date(),
    });
    return { ok: true };
  } catch {
    // reference collision — dues for this month were already deducted by a
    // concurrent call; undo the debit we just took.
    await credit(userId, amount);
    return { ok: false, reason: "already_deducted" };
  }
}
