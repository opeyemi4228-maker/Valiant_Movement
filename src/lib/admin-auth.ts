import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { ADMIN_ROLE_LIST, ADMIN_ROLES, adminRoleByKey, type AdminRole } from "@/data/admin-roles";

/**
 * Admin auth for the scoped coordinator dashboards (National / State / LGA /
 * Ward). Intentionally independent of the member database so the dashboards
 * work even before Neon is connected — the session is a stateless HMAC-signed
 * cookie that carries only the role key.
 *
 * Mock credentials live in `@/data/admin-roles`. Replace with real
 * `appointments` (role × portfolio × jurisdiction) once the DB is live.
 */

const COOKIE = "vm_admin";
const SECRET =
  process.env.ADMIN_SESSION_SECRET ?? process.env.NIN_HASH_SECRET ?? "dev-admin-secret";
const MAX_AGE = 60 * 60 * 8; // 8h

// The national seat can still be overridden by env (back-compat).
const ENV_SUPER_EMAIL = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
const ENV_SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

export const SUPER_ADMIN_EMAIL = ENV_SUPER_EMAIL ?? ADMIN_ROLES.national.email;

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

/** Returns the matching admin role for these credentials, or null. */
export function verifyAdmin(email: string, password: string): AdminRole | null {
  const e = email.trim().toLowerCase();

  // National seat respects env overrides if provided.
  if (ENV_SUPER_EMAIL && ENV_SUPER_PASSWORD && e === ENV_SUPER_EMAIL && password === ENV_SUPER_PASSWORD) {
    return ADMIN_ROLES.national;
  }

  return (
    ADMIN_ROLE_LIST.find((r) => r.email === e && r.password === password) ?? null
  );
}

/** Back-compat helper. */
export function isSuperAdmin(email: string, password: string): boolean {
  return verifyAdmin(email, password)?.key === "national";
}

export async function createAdminSession(roleKey: string): Promise<void> {
  const token = `${roleKey}|${sign(roleKey)}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getAdminSession(): Promise<{ role: AdminRole } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const sep = token.lastIndexOf("|");
  if (sep < 0) return null;
  const roleKey = token.slice(0, sep);
  const sig = token.slice(sep + 1);

  const expected = sign(roleKey);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const role = adminRoleByKey(roleKey);
  return role ? { role } : null;
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
