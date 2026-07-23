"use server";

import { randomUUID } from "node:crypto";
import { getCurrentUserSafe } from "@/lib/session";
import { usesDb, hasMonnify, hasMonnifyDisbursement } from "@/lib/env";
import { env } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import * as wdb from "@/lib/wallet-db";
import type { PaymentDTO } from "@/lib/wallet-db";
import * as monnify from "@/lib/monnify";
import { notifyFinanceEvent } from "./finance";

/* ============================================================
   Wallet — real Naira deposits (Monnify hosted checkout) and
   withdrawals (Monnify disbursement/transfer), backed by the
   `wallets` + `payments` ledger. A deposit is only ever credited
   from a server-verified source (this file calling Monnify's
   status API, or the webhook route) — never from a client's
   claim that a payment went through.
   ============================================================ */

const MIN_DEPOSIT = 100;
const MIN_WITHDRAWAL = 500;
const MAX_WITHDRAWAL_PER_TX = 500_000; // sane default guardrail; raise/remove in .env-driven config as needed

export interface WalletSummary {
  available: boolean;
  monnifyConfigured: boolean;
  withdrawalsConfigured: boolean;
  balance: number;
  payments: PaymentDTO[];
}

async function me() {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return null;
  return u;
}

/** Polled every ~1.5s. Returns `null` on a transient failure (retries
 *  exhausted) so the client keeps whatever it last had on screen instead of
 *  flashing a zeroed-out balance — the next poll tick recovers. */
export async function getWalletSummary(): Promise<WalletSummary | null> {
  const u = await me();
  if (!u) {
    return { available: false, monnifyConfigured: false, withdrawalsConfigured: false, balance: 0, payments: [] };
  }
  try {
    const [balance, payments] = await withRetry(() => Promise.all([wdb.getBalance(u.id), wdb.listRecentPayments(u.id)]));
    return {
      available: true,
      monnifyConfigured: hasMonnify(),
      withdrawalsConfigured: hasMonnifyDisbursement(),
      balance,
      payments,
    };
  } catch (err) {
    console.error("getWalletSummary failed (returning null so the client keeps its last-known state):", err);
    return null;
  }
}

/* -------------------------------- deposits -------------------------------- */

export async function initializeDeposit(
  amountNaira: number,
): Promise<{ ok: boolean; checkoutUrl?: string; reference?: string; error?: string }> {
  const u = await me();
  if (!u) return { ok: false, error: "Sign in to deposit." };
  if (!hasMonnify()) return { ok: false, error: "Payments aren't connected yet — ask an admin to add Monnify API keys." };
  const amount = Math.round(amountNaira);
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
    return { ok: false, error: `Minimum deposit is ${MIN_DEPOSIT.toLocaleString()} naira.` };
  }

  const reference = `dep_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await wdb.createPendingDeposit({
    userId: u.id,
    reference,
    amount,
    description: "Wallet top-up",
  });

  try {
    const result = await monnify.initializeTransaction({
      amountNaira: amount,
      reference,
      customerEmail: u.email,
      customerName: u.fullName ?? u.email.split("@")[0],
      description: "Valiant Wallet top-up",
      redirectUrl: `${env.APP_URL}/api/payments/monnify/return?ref=${reference}`,
    });
    return { ok: true, checkoutUrl: result.checkoutUrl, reference };
  } catch (err) {
    await wdb.markDepositFailed(reference, err instanceof Error ? err.message : "gateway_error");
    console.error("initializeDeposit failed:", err);
    return { ok: false, error: "Couldn't start the deposit — please try again." };
  }
}

/**
 * Server-verified truth check — called when the member returns from the
 * Monnify checkout page, in case the webhook hasn't landed yet. Shares the
 * same idempotent finalize path as the webhook, so whichever arrives first
 * wins and the other is a safe no-op.
 */
export async function verifyDeposit(reference: string): Promise<{ ok: boolean; status: string }> {
  const u = await me();
  if (!u || !hasMonnify()) return { ok: false, status: "unavailable" };
  try {
    const status = await monnify.getTransactionStatus(reference);
    if (status.paymentStatus === "PAID" || status.paymentStatus === "OVERPAID") {
      const res = await wdb.finalizeDeposit(reference, status.transactionReference);
      if (res.ok && !res.alreadyFinalized && res.userId && res.amount) {
        await notifyFinanceEvent("deposit", res.amount, "Monnify");
      }
      return { ok: true, status: "paid" };
    }
    if (status.paymentStatus === "FAILED" || status.paymentStatus === "CANCELLED" || status.paymentStatus === "EXPIRED") {
      await wdb.markDepositFailed(reference, status.paymentStatus.toLowerCase());
      return { ok: true, status: "failed" };
    }
    return { ok: true, status: "pending" };
  } catch (err) {
    console.error("verifyDeposit failed:", err);
    return { ok: false, status: "error" };
  }
}

/* ------------------------------- withdrawals ------------------------------- */

export async function listWithdrawalBanks(): Promise<{ name: string; code: string }[]> {
  if (!hasMonnify()) return [];
  try {
    return await monnify.listBanks();
  } catch (err) {
    console.error("listWithdrawalBanks failed:", err);
    return [];
  }
}

export async function resolveWithdrawalAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{ ok: boolean; accountName?: string; error?: string }> {
  if (!hasMonnify()) return { ok: false, error: "Payments aren't connected yet." };
  if (!/^\d{10}$/.test(accountNumber)) return { ok: false, error: "Enter a valid 10-digit account number." };
  try {
    const resolved = await monnify.validateAccount(accountNumber, bankCode);
    return { ok: true, accountName: resolved.accountName };
  } catch (err) {
    console.error("resolveWithdrawalAccount failed:", err);
    return { ok: false, error: "Couldn't verify that account — check the number and bank." };
  }
}

export async function requestWithdrawal(
  amountNaira: number,
  bankCode: string,
  accountNumber: string,
): Promise<{ ok: boolean; error?: string }> {
  const u = await me();
  if (!u) return { ok: false, error: "Sign in to withdraw." };
  if (!hasMonnifyDisbursement()) {
    return { ok: false, error: "Withdrawals aren't connected yet — ask an admin to finish the payout setup." };
  }
  const amount = Math.round(amountNaira);
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) {
    return { ok: false, error: `Minimum withdrawal is ${MIN_WITHDRAWAL.toLocaleString()} naira.` };
  }
  if (amount > MAX_WITHDRAWAL_PER_TX) {
    return { ok: false, error: `Withdrawals are capped at ${MAX_WITHDRAWAL_PER_TX.toLocaleString()} naira per request.` };
  }

  // Quick balance check for a friendly error before we even touch the
  // gateway — the real, race-free check happens inside createWithdrawalRequest.
  const balance = await wdb.getBalance(u.id);
  if (amount > balance) return { ok: false, error: "Amount exceeds your available balance." };

  let accountName: string;
  try {
    const resolved = await monnify.validateAccount(accountNumber, bankCode);
    accountName = resolved.accountName;
  } catch (err) {
    console.error("withdrawal account validation failed:", err);
    return { ok: false, error: "Couldn't verify that account — check the number and bank." };
  }

  const reference = `wd_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const reserved = await wdb.createWithdrawalRequest({
    userId: u.id,
    reference,
    amount,
    destinationBankCode: bankCode,
    destinationAccountNumber: accountNumber,
    destinationAccountName: accountName,
    description: `Withdrawal to ${accountName}`,
  });
  if (!reserved.ok) {
    return { ok: false, error: reserved.error === "insufficient_funds" ? "Amount exceeds your available balance." : "Couldn't start the withdrawal." };
  }

  try {
    const transfer = await monnify.transferSingle({
      amountNaira: amount,
      reference,
      narration: `Valiant Wallet withdrawal`,
      destinationBankCode: bankCode,
      destinationAccountNumber: accountNumber,
    });
    if (transfer.status === "SUCCESS") {
      await wdb.finalizeWithdrawalOutcome(reference, "success");
      await notifyFinanceEvent("withdrawal", amount, accountName);
    } else if (transfer.status === "FAILED") {
      await wdb.finalizeWithdrawalOutcome(reference, "failed", "gateway_rejected");
      return { ok: false, error: "The transfer was declined — your balance has been refunded." };
    }
    // PENDING → awaiting the disbursement webhook to settle it.
    return { ok: true };
  } catch (err) {
    console.error("requestWithdrawal transfer failed:", err);
    await wdb.recordWithdrawalDispatchFailure(reserved.paymentId!, err instanceof Error ? err.message : "gateway_error");
    return { ok: false, error: "Couldn't reach the payment gateway — your balance has been refunded." };
  }
}
