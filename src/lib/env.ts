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

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (!value || typeof value !== "string") {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}
