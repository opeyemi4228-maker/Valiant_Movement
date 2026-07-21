import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions, users } from "@/db/schema";
import { generateToken, hashToken } from "./tokens";
import { DEMO_MEMBER_EMAIL, getDemoMemberSession } from "./demo-member";
import { hasDb } from "./env";
import { getLocalMember } from "./demo-store";
import { withRetry } from "./retry";

const COOKIE = "vm_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Short-lived in-process cache for the session→user lookup, keyed by token
 * hash. Every dashboard tab mount fires several server actions in the same
 * instant (feed + stories + presence + notifications + …), and each one used
 * to independently re-run the sessions⋈users⋈profiles join. On a warm
 * instance this collapses that burst — and every poll tick after it — down
 * to one DB round trip every few seconds instead of one per action per tick.
 * TTL is short enough that a status change (suspend/ban) or a profile edit
 * still lands within a couple of seconds; `destroySession` also evicts
 * immediately so logout never reads stale.
 */
const SESSION_CACHE_TTL_MS = 3000;
const sessionCache = new Map<string, { user: CurrentUser | null; expiresAt: number }>();

function cacheGetUser(tokenHash: string): CurrentUser | null | undefined {
  const hit = sessionCache.get(tokenHash);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    sessionCache.delete(tokenHash);
    return undefined;
  }
  return hit.user;
}

function cacheSetUser(tokenHash: string, user: CurrentUser | null): void {
  if (sessionCache.size > 500) {
    // opportunistic sweep so a long-lived instance can't grow this unbounded
    const now = Date.now();
    for (const [k, v] of sessionCache) if (v.expiresAt < now) sessionCache.delete(k);
  }
  sessionCache.set(tokenHash, { user, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
}

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
    const tokenHash = hashToken(token);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    sessionCache.delete(tokenHash);
    cookieStore.delete(COOKIE);
  }
}

export interface CurrentUser {
  id: string;
  email: string;
  status: string;
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
}

/** Returns the signed-in user (validating the session token + expiry), or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Demo / in-memory sessions apply ONLY when there's no database. With a DB
  // configured, the demo accounts are seeded as real users, so we ignore any
  // stale in-memory cookies and use normal DB sessions below.
  if (!hasDb()) {
    const local = await getLocalMember();
    if (local) {
      return {
        id: local.id,
        email: local.email,
        status: "active",
        emailVerified: true,
        fullName: local.fullName,
        avatarUrl: local.avatar ?? null,
      };
    }
    const demo = await getDemoMemberSession();
    if (demo) {
      return {
        id: "demo-member",
        email: demo.email || DEMO_MEMBER_EMAIL,
        status: demo.status,
        emailVerified: true,
        fullName: demo.fullName,
        avatarUrl: null,
      };
    }
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const cached = cacheGetUser(tokenHash);
  if (cached !== undefined) return cached;

  // Retry the lookup so a Neon cold-start blip doesn't crash the page.
  // 5 attempts (~4.5s of backoff) outlasts all but the coldest starts.
  const rows = await withRetry(
    () =>
      db
      .select({
        id: users.id,
        email: users.email,
        status: users.status,
        emailVerified: users.emailVerified,
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1),
    5,
  );

  const user = rows[0] ?? null;
  cacheSetUser(tokenHash, user);
  return user;
}

/**
 * getCurrentUser for read/load/poll paths: a hard transient failure (DB
 * unreachable beyond the retry budget) degrades to "signed out for this
 * request" instead of crashing the page — the next request recovers.
 * Mutating actions should keep using getCurrentUser and surface the error.
 */
export async function getCurrentUserSafe(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (err) {
    console.error("getCurrentUserSafe: session lookup failed:", err);
    return null;
  }
}
