import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/* ============================================================
   Monnify API client — NGN deposits (hosted checkout) and
   withdrawals (single disbursement/transfer).

   Endpoints and payload shapes below match Monnify's published v1 API
   (developers.monnify.com) as of this writing. Payment-provider APIs do
   shift between versions occasionally — before the first real sandbox
   transaction, diff this file's request/response shapes against the
   current docs for:
     - "Initialize Transaction" and "Get Transaction Status" (Collections)
     - "Single Transfer" and its webhook payload (Disbursements)
   Everything else here (auth, signing, retries) is stable.

   IMPORTANT (operational, not code): Monnify gates disbursements (payouts)
   behind 2FA by default — a transfer normally needs an OTP confirmation.
   Fully-automated instant withdrawals (as configured here) require asking
   Monnify support to disable 2FA on your disbursement wallet; otherwise
   `transferSingle` will succeed at the API level but the transfer will sit
   waiting for manual OTP approval in the Monnify dashboard.
   ============================================================ */

interface MonnifyEnvelope<T> {
  requestSuccessful: boolean;
  responseMessage: string;
  responseCode: string;
  responseBody: T;
}

class MonnifyError extends Error {
  constructor(message: string, public responseCode?: string) {
    super(message);
    this.name = "MonnifyError";
  }
}

function baseUrl(): string {
  return env.MONNIFY_BASE_URL.replace(/\/$/, "");
}

/* ------------------------------ auth token ------------------------------
   Bearer tokens are valid ~1 hour; cached in-process with a safety margin so
   concurrent requests don't each pay a fresh login round trip. */

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const basic = Buffer.from(`${env.MONNIFY_API_KEY}:${env.MONNIFY_SECRET_KEY}`).toString("base64");
  const res = await fetch(`${baseUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  const json = (await res.json()) as MonnifyEnvelope<{ accessToken: string; expiresIn: number }>;
  if (!res.ok || !json.requestSuccessful) {
    throw new MonnifyError(json.responseMessage || "Monnify authentication failed", json.responseCode);
  }
  cachedToken = {
    value: json.responseBody.accessToken,
    expiresAt: Date.now() + Math.max(0, (json.responseBody.expiresIn - 60) * 1000),
  };
  return cachedToken.value;
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const json = (await res.json()) as MonnifyEnvelope<T>;
  if (!res.ok || !json.requestSuccessful) {
    throw new MonnifyError(json.responseMessage || `Monnify request failed: ${path}`, json.responseCode);
  }
  return json.responseBody;
}

/* ------------------------------- deposits ------------------------------- */

export interface InitTransactionResult {
  checkoutUrl: string;
  transactionReference: string;
  paymentReference: string;
}

/** Start a hosted-checkout deposit. `reference` is OUR idempotency key. */
export async function initializeTransaction(input: {
  amountNaira: number;
  reference: string;
  customerEmail: string;
  customerName: string;
  description: string;
  redirectUrl: string;
}): Promise<InitTransactionResult> {
  return authedFetch<InitTransactionResult>("/api/v1/merchant/transactions/init-transaction", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountNaira,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      paymentReference: input.reference,
      paymentDescription: input.description,
      currencyCode: "NGN",
      contractCode: env.MONNIFY_CONTRACT_CODE,
      redirectUrl: input.redirectUrl,
      paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD"],
    }),
  });
}

export type MonnifyPaymentStatus =
  | "PAID"
  | "PENDING"
  | "OVERPAID"
  | "PARTIALLY_PAID"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export interface TransactionStatusResult {
  paymentReference: string;
  transactionReference: string;
  paymentStatus: MonnifyPaymentStatus;
  amountPaid: number;
}

/** Server-side truth check — never trust a client-reported "I paid". */
export async function getTransactionStatus(paymentReference: string): Promise<TransactionStatusResult> {
  return authedFetch<TransactionStatusResult>(
    `/api/v1/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`,
  );
}

/* ------------------------------ withdrawals ------------------------------ */

export interface BankOption {
  name: string;
  code: string;
}

export async function listBanks(): Promise<BankOption[]> {
  return authedFetch<BankOption[]>("/api/v1/banks");
}

export interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

/** Resolve a bank account's registered name before ever sending money to it. */
export async function validateAccount(accountNumber: string, bankCode: string): Promise<ResolvedAccount> {
  return authedFetch<ResolvedAccount>(
    `/api/v1/disbursements/account/validate?accountNumber=${encodeURIComponent(accountNumber)}&bankCode=${encodeURIComponent(bankCode)}`,
  );
}

export type MonnifyTransferStatus = "PENDING" | "SUCCESS" | "FAILED" | "REVERSED";

export interface TransferResult {
  reference: string;
  status: MonnifyTransferStatus;
  amount: number;
}

/** Initiate a single payout. `reference` is OUR idempotency key. */
export async function transferSingle(input: {
  amountNaira: number;
  reference: string;
  narration: string;
  destinationBankCode: string;
  destinationAccountNumber: string;
}): Promise<TransferResult> {
  return authedFetch<TransferResult>("/api/v1/disbursements/single", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountNaira,
      reference: input.reference,
      narration: input.narration,
      destinationBankCode: input.destinationBankCode,
      destinationAccountNumber: input.destinationAccountNumber,
      currency: "NGN",
      sourceAccountNumber: env.MONNIFY_DISBURSEMENT_ACCOUNT,
    }),
  });
}

/* --------------------------- reserved accounts ---------------------------
   Dedicated (virtual) NUBANs. A member — or a structure treasury — gets a
   permanent account number they can be funded by ordinary bank transfer;
   the money arrives as a RESERVED_ACCOUNT "SUCCESSFUL_TRANSACTION" webhook,
   matched back by our `accountReference`. `accountReference` is OUR stable id
   for the reserved account (e.g. "wallet_<userId>"); it must be unique per
   account and is what the webhook echoes so we know whose wallet to credit. */

export interface ReservedBankAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode: string;
}

export interface ReservedAccountResult {
  accountReference: string;
  reservationReference: string;
  accounts: ReservedBankAccount[];
}

/** Provision a dedicated account. `getAllAvailableBanks` asks Monnify for a
 *  number at every partner bank, so the holder can be given whichever they
 *  trust. Safe to call once per account — a repeat with the same reference
 *  errors as a duplicate, so callers guard on "already provisioned". */
export async function createReservedAccount(input: {
  accountReference: string;
  accountName: string;
  customerEmail: string;
  customerName: string;
}): Promise<ReservedAccountResult> {
  const body = await authedFetch<{
    accountReference: string;
    reservationReference: string;
    accounts?: ReservedBankAccount[];
    // Older single-bank responses return flat fields instead of `accounts`.
    accountNumber?: string;
    accountName?: string;
    bankName?: string;
    bankCode?: string;
  }>("/api/v2/bank-transfer/reserved-accounts", {
    method: "POST",
    body: JSON.stringify({
      accountReference: input.accountReference,
      accountName: input.accountName.slice(0, 100),
      currencyCode: "NGN",
      contractCode: env.MONNIFY_CONTRACT_CODE,
      customerEmail: input.customerEmail,
      customerName: input.customerName.slice(0, 100),
      getAllAvailableBanks: true,
    }),
  });
  const accounts: ReservedBankAccount[] = body.accounts?.length
    ? body.accounts
    : body.accountNumber
    ? [
        {
          accountNumber: body.accountNumber,
          accountName: body.accountName ?? input.accountName,
          bankName: body.bankName ?? "",
          bankCode: body.bankCode ?? "",
        },
      ]
    : [];
  return {
    accountReference: body.accountReference,
    reservationReference: body.reservationReference,
    accounts,
  };
}

/** Fetch an already-created reserved account by our reference. Used to recover
 *  when createReservedAccount reports the reference as a duplicate (the account
 *  was created on a prior attempt but never persisted our side). */
export async function getReservedAccount(accountReference: string): Promise<ReservedAccountResult> {
  const body = await authedFetch<{
    accountReference: string;
    reservationReference: string;
    accounts?: ReservedBankAccount[];
  }>(`/api/v2/bank-transfer/reserved-accounts/${encodeURIComponent(accountReference)}`);
  return {
    accountReference: body.accountReference,
    reservationReference: body.reservationReference,
    accounts: body.accounts ?? [],
  };
}

/** True when a createReservedAccount error is "this reference already exists". */
export function isDuplicateReferenceError(err: unknown): boolean {
  if (!(err instanceof MonnifyError)) return false;
  return err.responseCode === "99" || /same reference|already/i.test(err.message);
}

/* ------------------------------- webhooks -------------------------------
   Monnify signs each webhook body with HMAC-SHA512 keyed by the secret key,
   sent in the `monnify-signature` header. Verify against the RAW request
   body (before JSON.parse) — re-serializing can reorder keys and break the
   signature. */

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", env.MONNIFY_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export { MonnifyError };
