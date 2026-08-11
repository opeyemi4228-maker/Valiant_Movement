"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getAdminSession } from "@/lib/admin-auth";
import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import {
  createActivity,
  activitiesForScope,
  activitiesForMember,
  type ActivityDTO,
} from "@/lib/activities-db";

/* Coordinator field-activity log — post + read for the dashboard and the feed. */

/** Log an activity the signed-in coordinator did in their jurisdiction. */
export async function postCoordinatorActivity(
  body: string,
  image?: string,
): Promise<{ ok: boolean; activity?: ActivityDTO; error?: string }> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sign in as a coordinator." };
  const text = body.trim();
  if (text.length < 3) return { ok: false, error: "Write a few words about the activity." };
  try {
    const activity = await createActivity({
      scope: admin.role.scope,
      roleKey: admin.role.key,
      authorTitle: admin.role.title,
      body: text,
      image: image ?? null,
    });
    return { ok: true, activity };
  } catch (err) {
    console.error("postCoordinatorActivity failed:", err);
    return { ok: false, error: "Couldn't save the activity — please try again." };
  }
}

/** The signed-in coordinator's own activity log (their dashboard). */
export async function getMyActivities(): Promise<ActivityDTO[]> {
  const admin = await getAdminSession();
  if (!admin) return [];
  try {
    return await withRetry(() => activitiesForScope(admin.role.scope));
  } catch (err) {
    console.error("getMyActivities failed:", err);
    return [];
  }
}

/** Activities to surface in the signed-in member's general feed — national +
 *  their state + LGA + ward, newest first. */
export async function getFeedActivities(): Promise<ActivityDTO[]> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return [];
  try {
    const [p] = await db
      .select({ stateId: profiles.stateId, lgaId: profiles.lgaId, ward: profiles.ward })
      .from(profiles)
      .where(eq(profiles.userId, u.id))
      .limit(1);
    return await withRetry(() =>
      activitiesForMember({ stateId: p?.stateId ?? null, lgaId: p?.lgaId ?? null, ward: p?.ward ?? null }),
    );
  } catch (err) {
    console.error("getFeedActivities failed:", err);
    return [];
  }
}
