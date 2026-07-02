import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emailVerifications, users } from "@/db/schema";
import { hashToken } from "@/lib/tokens";

/**
 * GET /api/auth/verify?token=...
 * Consumes a verification token, activates the account, and redirects to the
 * login page with a status flag the UI can surface.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const redirectTo = (status: string) =>
    NextResponse.redirect(new URL(`/login?verify=${status}`, request.url));

  if (!token) return redirectTo("invalid");

  const tokenHash = hashToken(token);

  const row = (
    await db
      .select({ id: emailVerifications.id, userId: emailVerifications.userId })
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.tokenHash, tokenHash),
          isNull(emailVerifications.consumedAt),
          gt(emailVerifications.expiresAt, new Date()),
        ),
      )
      .limit(1)
  )[0];

  if (!row) return redirectTo("invalid");

  try {
    await db.batch([
      db
        .update(emailVerifications)
        .set({ consumedAt: new Date() })
        .where(eq(emailVerifications.id, row.id)),
      db
        .update(users)
        .set({ emailVerified: true, status: "active", updatedAt: new Date() })
        .where(eq(users.id, row.userId)),
    ]);
  } catch (err) {
    console.error("[verify] failed", err);
    return redirectTo("error");
  }

  return redirectTo("success");
}
