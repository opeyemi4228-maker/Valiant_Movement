import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Demo member auth — a ready-to-use member account that signs in through the
 * normal login form without needing the Neon database (mirrors the Super Admin
 * pattern in `admin-auth.ts`). The session is a stateless HMAC-signed cookie.
 *
 * Remove this once real members exist in the database.
 */

const COOKIE = "vm_demo";
const SECRET =
  process.env.ADMIN_SESSION_SECRET ?? process.env.NIN_HASH_SECRET ?? "dev-admin-secret";

export const DEMO_MEMBER_EMAIL = (
  process.env.DEMO_MEMBER_EMAIL ?? "member@valiantmovement.com"
).toLowerCase();
const DEMO_MEMBER_PASSWORD = process.env.DEMO_MEMBER_PASSWORD ?? "Valiant2026";

/** Fixed profile presented for the demo member. */
export const DEMO_MEMBER_PROFILE = {
  fullName: "Chidi Okafor",
  status: "active" as const,
};

const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

export function isDemoMember(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === DEMO_MEMBER_EMAIL && password === DEMO_MEMBER_PASSWORD
  );
}

export async function createDemoMemberSession(): Promise<void> {
  const token = `${DEMO_MEMBER_EMAIL}|${sign(DEMO_MEMBER_EMAIL)}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getDemoMemberSession(): Promise<{
  email: string;
  fullName: string;
  status: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  
  if (!token) return null;

  const sep = token.lastIndexOf("|");
  if (sep < 0) return null;
  const email = token.slice(0, sep);
  const sig = token.slice(sep + 1);

  const expected = sign(email);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { email, fullName: DEMO_MEMBER_PROFILE.fullName, status: DEMO_MEMBER_PROFILE.status };
}

export async function destroyDemoMemberSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
