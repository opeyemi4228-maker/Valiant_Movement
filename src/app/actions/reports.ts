"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberReports, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { usesDb } from "@/lib/env";
import * as mem from "@/lib/demo-store";

/* ============================================================
   Member reports — a member flags another member for the
   moderation team. One OPEN report per reporter→member pair
   (DB-enforced by a partial unique index); once a report is
   resolved the member can be reported again. Postgres for real
   members, the demo store mirror otherwise.
   ============================================================ */

export type ReportCategory =
  | "harassment"
  | "spam"
  | "impersonation"
  | "hate"
  | "violence"
  | "other";

const CATEGORIES: ReportCategory[] = ["harassment", "spam", "impersonation", "hate", "violence", "other"];

const MAX_DETAILS = 1000;

export async function reportMember(
  reportedId: string,
  category: ReportCategory,
  details?: string,
): Promise<{ ok: boolean; error?: string }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Sign in to report a member." };
  if (reportedId === u.id) return { ok: false, error: "You can't report yourself." };
  if (!CATEGORIES.includes(category)) return { ok: false, error: "Pick a report reason." };
  const trimmedDetails = details?.trim().slice(0, MAX_DETAILS) || null;

  if (!usesDb(u.id)) {
    const res = mem.addMemberReport({ reporterId: u.id, reportedId, category, details: trimmedDetails });
    if (!res.ok) {
      return { ok: false, error: "You've already reported this member — our team is reviewing it." };
    }
    return { ok: true };
  }

  // The reported member must be a real account (a slug id can't be a DB member).
  if (!usesDb(reportedId)) return { ok: false, error: "That member no longer exists." };
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, reportedId)).limit(1);
  if (!target) return { ok: false, error: "That member no longer exists." };

  try {
    await db.insert(memberReports).values({
      reporterId: u.id,
      reportedId,
      category,
      details: trimmedDetails,
    });
  } catch (err) {
    // Partial unique index: one open report per reporter→member pair.
    if (isUniqueViolation(err)) {
      return { ok: false, error: "You've already reported this member — our team is reviewing it." };
    }
    console.error("reportMember failed:", err);
    return { ok: false, error: "Couldn't submit the report — please try again." };
  }
  return { ok: true };
}

/** Drizzle wraps driver errors — walk the cause chain for Postgres 23505. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: string }).code === "23505") return true;
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("member_reports_open_pair_idx") || msg.includes("duplicate key")) return true;
  }
  return false;
}
