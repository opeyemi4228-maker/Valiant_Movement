"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { notify, hasRecentNotif } from "@/lib/notify";

/* ============================================================
   Finance notifications — deposit/withdrawal confirmations and
   the monthly-dues cycle: reminders 5,4,3,2,1 days before the
   due date, then the deduction (or an insufficient-funds notice
   with a deposit prompt). Reminders dedupe to one per day.
   ============================================================ */

const DUES_NAIRA = 5_000;
const DUE_DAY = 28; // dues collect on the 28th of every month
const DAY_MS = 86_400_000;

function fmtNaira(n: number): string {
  return "₦" + n.toLocaleString("en-NG");
}

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
 * or Notifications open — each phase fires at most once per day.
 * `walletBalance` (naira) decides deduction vs insufficient-funds on due day.
 */
export async function ensureDuesNotifications(walletBalance?: number): Promise<void> {
  const u = await getCurrentUserSafe();
  if (!u) return;

  const now = new Date();
  let due = new Date(now.getFullYear(), now.getMonth(), DUE_DAY, 23, 59, 59);
  if (now.getTime() > due.getTime()) due = new Date(now.getFullYear(), now.getMonth() + 1, DUE_DAY, 23, 59, 59);
  const startOfDueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const daysLeft = Math.max(0, Math.ceil((startOfDueDay - now.getTime()) / DAY_MS));
  const monthName = due.toLocaleDateString("en-GB", { month: "long" });

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
    if (walletBalance !== undefined && walletBalance < DUES_NAIRA) {
      const prefix = "Insufficient funds";
      if (await hasRecentNotif(u.id, "dues", { bodyPrefix: prefix, withinMs: 20 * 3600_000 })) return;
      await notify(u.id, {
        type: "dues",
        body: `${prefix}: your ${fmtNaira(DUES_NAIRA)} ${monthName} dues couldn't be deducted. Deposit now to keep your membership active — every naira funds the movement on the ground.`,
        href: "finance",
      });
      return;
    }
    const prefix = "Dues deducted";
    if (await hasRecentNotif(u.id, "dues", { bodyPrefix: prefix, withinMs: 20 * 3600_000 })) return;
    await notify(u.id, {
      type: "dues",
      body: `${prefix}: ${fmtNaira(DUES_NAIRA)} monthly dues for ${monthName} deducted from your wallet. Thank you for keeping the movement strong.`,
      href: "finance",
    });
  }
}
