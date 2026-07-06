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
};

/** True when a real Postgres connection is configured. When false, the app
 *  runs on the in-memory demo backend (see src/lib/demo-store.ts). */
export function hasDb(): boolean {
  return env.DATABASE_URL.trim().length > 0;
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
