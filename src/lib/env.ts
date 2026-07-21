/**
 * Centralized environment access. Values are read lazily so `next build`
 * doesn't fail when secrets are absent; runtime code that needs a value calls
 * `requireEnv(...)` which throws a clear error if it's missing.
 */

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  // For local testing without a verified domain, Resend allows onboarding@resend.dev
  EMAIL_FROM: process.env.EMAIL_FROM ?? "Valiant Movement <onboarding@resend.dev>",
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  // HMAC secret used to hash NINs before storage (never store raw NIN).
  NIN_HASH_SECRET: process.env.NIN_HASH_SECRET ?? "dev-insecure-change-me",
  isProd: process.env.NODE_ENV === "production",

  // ---- Monnify (wallet deposits + withdrawals, NGN) ----
  // Sandbox by default; switch MONNIFY_BASE_URL + keys to go live — no code
  // change. See DATABASE.md / README for setup notes.
  MONNIFY_BASE_URL: process.env.MONNIFY_BASE_URL ?? "https://sandbox.monnify.com",
  MONNIFY_API_KEY: process.env.MONNIFY_API_KEY ?? "",
  MONNIFY_SECRET_KEY: process.env.MONNIFY_SECRET_KEY ?? "",
  MONNIFY_CONTRACT_CODE: process.env.MONNIFY_CONTRACT_CODE ?? "",
  // The merchant wallet that withdrawals are disbursed FROM. Required only
  // if automated withdrawals are enabled.
  MONNIFY_DISBURSEMENT_ACCOUNT: process.env.MONNIFY_DISBURSEMENT_ACCOUNT ?? "",
};

/** True when a real Postgres connection is configured. When false, the app
 *  runs on the in-memory demo backend (see src/lib/demo-store.ts). */
export function hasDb(): boolean {
  return env.DATABASE_URL.trim().length > 0;
}

/** True when Monnify credentials are configured. When false, the Finance
 *  dashboard shows the balance/history it already has but disables new
 *  deposits/withdrawals with a clear "not connected yet" state instead of
 *  a broken or fake-looking payment flow. */
export function hasMonnify(): boolean {
  return !!(env.MONNIFY_API_KEY && env.MONNIFY_SECRET_KEY && env.MONNIFY_CONTRACT_CODE);
}

/** True when the disbursement (withdrawal payout) wallet is configured. */
export function hasMonnifyDisbursement(): boolean {
  return hasMonnify() && !!env.MONNIFY_DISBURSEMENT_ACCOUNT;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Routes an action to Postgres only when a DB is configured AND the id in
 * hand is a DB id (UUID). Demo-store ids are readable slugs ("m_amara",
 * "c_seed", "demo-member") that must never reach a uuid column — a member
 * signed in through the demo backend stays on it even after DATABASE_URL is
 * set, until they log in with a real account.
 */
export function usesDb(id: string): boolean {
  return hasDb() && UUID_RE.test(id);
}

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (!value || typeof value !== "string") {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}
