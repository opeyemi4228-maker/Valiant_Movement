"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import { notify, hasRecentNotif } from "@/lib/notify";
import { deductDues, getBalance } from "@/lib/wallet-db";
import { fmtNaira } from "@/lib/wallet-types";

/* ============================================================
   Finance notifications + the monthly-dues clock: reminders
   5,4,3,2,1 days before the due date, then a REAL deduction from
   the member's wallet ledger on the due date itself (or an
   insufficient-funds notice with a deposit prompt if it can't be
   covered). Reminders dedupe to one per day; the deduction itself
   is naturally idempotent (see deductDues in wallet-db.ts).
   ============================================================ */

const DUES_NAIRA = 5_000;
const DUE_DAY = 28; // dues collect on the 28th of every month
const DAY_MS = 86_400_000;

export async function notifyFinanceEvent(
  kind: "deposit" | "withdrawal",
  amount: number,
  detail?: string,
): Promise<void> {
  const u = await getCurrentUserSafe();
  if (!u || !Number.isFinite(amount) || amount <= 0) return;
  const body =
    kind === "deposit"
      ? `Deposit confirmed: ${fmtNaira(amount)} added to your Valiant Wallet${detail ? ` via ${detail}` : ""}.`
      : `Withdrawal processed: ${fmtNaira(amount)} on its way${detail ? ` to ${detail}` : ""}.`;
  await notify(u.id, { type: "finance", body, href: "finance" });
}

/**
 * Run the dues clock for the signed-in member. Safe to call on every Finance
 * or Notifications open — reminders fire at most once a day; the deduction
 * on the due date is checked against the REAL wallet balance and only ever
 * applied once per month (enforced by a unique ledger reference, not by
 * trusting the caller not to call this twice).
 */
export async function ensureDuesNotifications(): Promise<void> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return;

  const now = new Date();
  let due = new Date(now.getFullYear(), now.getMonth(), DUE_DAY, 23, 59, 59);
  if (now.getTime() > due.getTime()) due = new Date(now.getFullYear(), now.getMonth() + 1, DUE_DAY, 23, 59, 59);
  const startOfDueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const daysLeft = Math.max(0, Math.ceil((startOfDueDay - now.getTime()) / DAY_MS));
  const monthName = due.toLocaleDateString("en-GB", { month: "long" });
  const monthKey = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;

  if (daysLeft >= 1 && daysLeft <= 5) {
    const prefix = "Monthly dues reminder";
    if (await hasRecentNotif(u.id, "dues", { bodyPrefix: prefix, withinMs: 20 * 3600_000 })) return;
    await notify(u.id, {
      type: "dues",
      body: `${prefix}: ${fmtNaira(DUES_NAIRA)} will be deducted in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${DUE_DAY} ${monthName}). Keep your wallet funded — dues power ward organising.`,
      href: "finance",
    });
    return;
  }

  if (daysLeft === 0) {
    const result = await deductDues(u.id, DUES_NAIRA, `dues_${u.id}_${monthKey}`, `Monthly dues — ${monthName}`);
    if (result.ok) {
      await notify(u.id, {
        type: "dues",
        body: `Dues deducted: ${fmtNaira(DUES_NAIRA)} monthly dues for ${monthName} deducted from your wallet. Thank you for keeping the movement strong.`,
        href: "finance",
      });
      return;
    }
    if (result.reason === "insufficient_funds") {
      const prefix = "Insufficient funds";
      if (await hasRecentNotif(u.id, "dues", { bodyPrefix: prefix, withinMs: 20 * 3600_000 })) return;
      await notify(u.id, {
        type: "dues",
        body: `${prefix}: your ${fmtNaira(DUES_NAIRA)} ${monthName} dues couldn't be deducted. Deposit now to keep your membership active — every naira funds the movement on the ground.`,
        href: "finance",
      });
    }
    // reason === "already_deducted" → this month is settled; nothing to do.
  }
}

/** Polled every ~1.5s. Returns `null` on a transient failure so the client
 *  keeps its last-known state instead of flashing a zeroed balance. */
export async function getDuesStatus(): Promise<{ due: string; amount: number; balance: number } | null> {
  const u = await getCurrentUserSafe();
  const now = new Date();
  let due = new Date(now.getFullYear(), now.getMonth(), DUE_DAY);
  if (now.getDate() > DUE_DAY) due = new Date(now.getFullYear(), now.getMonth() + 1, DUE_DAY);
  try {
    const balance = u && usesDb(u.id) ? await withRetry(() => getBalance(u.id)) : 0;
    return { due: due.toISOString(), amount: DUES_NAIRA, balance };
  } catch (err) {
    console.error("getDuesStatus failed (returning null so the client keeps its last-known state):", err);
    return null;
  }
}
