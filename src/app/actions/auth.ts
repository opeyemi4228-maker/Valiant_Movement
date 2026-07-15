"use server";

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  emailVerifications,
  identities,
  lgas,
  ninSyncJobs,
  profiles,
  states,
  users,
} from "@/db/schema";
import {
  createAdminSession,
  destroyAdminSession,
  verifyAdmin,
} from "@/lib/admin-auth";
import {
  createDemoMemberSession,
  destroyDemoMemberSession,
  isDemoMember,
} from "@/lib/demo-member";
import { sendVerificationEmail } from "@/lib/email";
import { env, hasDb } from "@/lib/env";
import {
  addMember,
  clearLocalSession,
  createLocalSession,
  emailTaken,
  findByCredentials,
} from "@/lib/demo-store";
import { ensureGeoCommunities } from "@/lib/communities";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { generateToken, hashNin, hashToken } from "@/lib/tokens";
import { loginSchema, registerSchema } from "@/lib/validation";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  role?: "superadmin" | "member";
}

const EMAIL_TOKEN_TTL = 1000 * 60 * 60 * 24; // 24h

/* ----------------------------- register ----------------------------- */

export async function registerMember(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }

  const data = parsed.data;
  const email = data.email.toLowerCase();

  // No database → create the member in the in-memory demo store and sign in.
  if (!hasDb()) {
    if (emailTaken(email)) {
      return {
        ok: false,
        error: "An account with this email already exists. Try signing in.",
        fieldErrors: { email: "Email already registered" },
      };
    }
    const member = addMember({ email, password: data.password, fullName: data.fullName });
    await createLocalSession(member.id);
    return { ok: true, role: "member", message: "Welcome to the movement." };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: false,
      error: "An account with this email already exists. Try signing in.",
      fieldErrors: { email: "Email already registered" },
    };
  }

  // Resolve seeded geo references (state + LGA). Ward/PU stored as text for now.
  const stateRow = (
    await db.select({ id: states.id }).from(states).where(eq(states.name, data.state)).limit(1)
  )[0];
  const lgaRow = stateRow
    ? (
        await db
          .select({ id: lgas.id })
          .from(lgas)
          .where(and(eq(lgas.stateId, stateRow.id), eq(lgas.name, data.lga)))
          .limit(1)
      )[0]
    : undefined;

  const userId = randomUUID();
  const passwordHash = await hashPassword(data.password);
  const token = generateToken();
  const ninHash =
    data.nin && data.nin.length === 11
      ? hashNin(data.nin, env.NIN_HASH_SECRET)
      : null;

  try {
    await db.batch([
      // Launch phase: members are verified + active on sign-up so they can use
      // the movement immediately (NIMC/email verification runs in the background
      // and is enforced once the NIMC API + email provider are live).
      db.insert(users).values({
        id: userId,
        email,
        phone: data.phone,
        passwordHash,
        emailVerified: true,
        status: "active",
      }),
      db.insert(identities).values({
        userId,
        ninHash,
        verificationStatus: "pending",
        source: "manual",
      }),
      db.insert(profiles).values({
        userId,
        fullName: data.fullName,
        stateId: stateRow?.id ?? null,
        lgaId: lgaRow?.id ?? null,
        ward: data.ward,
        pollingUnit: data.pollingUnit,
      }),
      db.insert(emailVerifications).values({
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL),
      }),
      // Enqueue NIN verification for the Listener Agent (runs once NIMC API is live)
      db.insert(ninSyncJobs).values({ userId, status: "queued" }),
    ]);
  } catch (err) {
    console.error("[registerMember] insert failed", err);
    return {
      ok: false,
      error:
        "We couldn't create your account. Make sure the database is migrated and seeded, then try again.",
    };
  }

  // Auto-join the State › LGA › Ward › Polling Unit communities for this
  // placement. Best-effort — never blocks sign-up (also self-heals on load).
  try {
    await ensureGeoCommunities(userId, {
      stateId: stateRow?.id ?? null,
      stateName: data.state,
      lgaId: lgaRow?.id ?? null,
      lgaName: data.lga,
      ward: data.ward,
      pollingUnit: data.pollingUnit,
    });
  } catch (err) {
    console.warn("[registerMember] community auto-join skipped", err);
  }

  // Best-effort verification email — never blocks sign-up if email isn't configured.
  try {
    const verifyUrl = `${env.APP_URL}/api/auth/verify?token=${token}`;
    await sendVerificationEmail(email, data.fullName, verifyUrl);
  } catch (err) {
    console.warn("[registerMember] verification email not sent", err);
  }

  // Sign the new member in straight away so they land in the app, ready to chat.
  const hdrs = await headers();
  await createSession(userId, {
    userAgent: hdrs.get("user-agent") ?? undefined,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  });

  return { ok: true, role: "member", message: "Welcome to the movement." };
}

/* ------------------------------ login ------------------------------ */

export async function loginMember(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  // Admins (National / State / LGA / Ward coordinators) sign in through the same
  // form, bypassing the member DB. All route to the scoped /admin dashboard.
  const adminRole = verifyAdmin(parsed.data.email, parsed.data.password);
  if (adminRole) {
    await createAdminSession(adminRole.key);
    return { ok: true, role: "superadmin" };
  }

  // No database → authenticate against the in-memory demo store (seeded with
  // Chidi Okafor + Amara Eze, plus anyone who registered this session).
  if (!hasDb()) {
    const member = findByCredentials(parsed.data.email, parsed.data.password);
    if (member) {
      await createLocalSession(member.id);
      return { ok: true, role: "member" };
    }
    return { ok: false, error: "Incorrect email or password." };
  }

  // Ready-to-use demo member — only without a database. With a DB the demo
  // accounts are seeded as real users (see db/seed.ts) and authenticate below,
  // so they persist and work across devices like any registered account.
  if (!hasDb() && isDemoMember(parsed.data.email, parsed.data.password)) {
    await createDemoMemberSession();
    return { ok: true, role: "member" };
  }

  const email = parsed.data.email.toLowerCase();

  const userRow = (
    await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        emailVerified: users.emailVerified,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
  )[0];

  // Same generic error whether the user exists or not (avoid account enumeration).
  if (!userRow || !(await verifyPassword(parsed.data.password, userRow.passwordHash))) {
    return { ok: false, error: "Incorrect email or password." };
  }

  if (!userRow.emailVerified) {
    return {
      ok: false,
      error: "Please verify your email first. Check your inbox for the link.",
    };
  }
  if (userRow.status === "suspended" || userRow.status === "banned") {
    return { ok: false, error: "This account is not active. Contact support." };
  }

  const hdrs = await headers();
  await createSession(userRow.id, {
    userAgent: hdrs.get("user-agent") ?? undefined,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  });

  return { ok: true };
}

/* ------------------------- resend verification ------------------------- */

export async function resendVerification(email: string): Promise<ActionResult> {
  const normalized = String(email).toLowerCase().trim();
  const userRow = (
    await db
      .select({ id: users.id, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1)
  )[0];

  // Always return ok (don't reveal whether the email exists).
  if (userRow && !userRow.emailVerified) {
    const token = generateToken();
    await db.insert(emailVerifications).values({
      userId: userRow.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL),
    });
    const verifyUrl = `${env.APP_URL}/api/auth/verify?token=${token}`;
    await sendVerificationEmail(normalized, "Member", verifyUrl);
  }
  return { ok: true, message: "If that email exists, a new link is on the way." };
}

/* ------------------------------ logout ------------------------------ */

export async function logout(): Promise<void> {
  await clearLocalSession();
  await destroyDemoMemberSession();
  if (hasDb()) {
    const { destroySession } = await import("@/lib/session");
    await destroySession();
  }
  redirect("/login");
}

export async function logoutAdmin(): Promise<void> {
  await destroyAdminSession();
  redirect("/login");
}
