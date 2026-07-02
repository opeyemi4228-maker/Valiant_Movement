import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions, users } from "@/db/schema";
import { generateToken, hashToken } from "./tokens";
import { DEMO_MEMBER_EMAIL, getDemoMemberSession } from "./demo-member";
import { hasDb } from "./env";
import { getLocalMember } from "./demo-store";

const COOKIE = "vm_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ip?: string },
): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: meta?.userAgent,
    ip: meta?.ip,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    cookieStore.delete(COOKIE);
  }
}

export interface CurrentUser {
  id: string;
  email: string;
  status: string;
  emailVerified: boolean;
  fullName: string | null;
}

/** Returns the signed-in user (validating the session token + expiry), or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // In-memory member (demo backend, no database). Real DB id-shaped so chat works.
  const local = await getLocalMember();
  if (local) {
    return {
      id: local.id,
      email: local.email,
      status: "active",
      emailVerified: true,
      fullName: local.fullName,
    };
  }

  // When there's no database, only the in-memory store provides members.
  if (!hasDb()) return null;

  // Demo member resolves without the database (mirrors the Super Admin path).
  const demo = await getDemoMemberSession();
  if (demo) {
    return {
      id: "demo-member",
      email: demo.email || DEMO_MEMBER_EMAIL,
      status: demo.status,
      emailVerified: true,
      fullName: demo.fullName,
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      status: users.status,
      emailVerified: users.emailVerified,
      fullName: profiles.fullName,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}
