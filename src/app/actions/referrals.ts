"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import { getAdminSession } from "@/lib/admin-auth";
import { withRetry } from "@/lib/retry";
import {
  getReferralOverview,
  referralLeaderboard,
  type ReferralOverview,
  type LeaderboardResult,
} from "@/lib/referrals-db";

/* Referral reads for the member profile + the coordinator leaderboards. */

/** The signed-in member's own referral picture: code, counts, tier, and list. */
export async function getMyReferrals(): Promise<ReferralOverview | null> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return null;
  try {
    return await withRetry(() => getReferralOverview(u.id));
  } catch (err) {
    console.error("getMyReferrals failed:", err);
    return null;
  }
}

export interface LeaderboardView extends LeaderboardResult {
  ok: boolean;
  jurisdiction?: string;
}

/**
 * The referral leaderboard for the signed-in coordinator, clamped to their
 * jurisdiction: National sees everyone, a State coordinator only their state,
 * an LGA coordinator only their LGA, a Ward Captain only their ward.
 */
export async function getReferralLeaderboard(): Promise<LeaderboardView> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, rows: [], totalReferrals: 0, activeRecruiters: 0 };
  const scope = admin.role.scope;
  try {
    const board = await withRetry(() =>
      referralLeaderboard({ stateName: scope.state, lgaName: scope.lga, ward: scope.ward }),
    );
    return { ok: true, ...board, jurisdiction: admin.role.jurisdiction };
  } catch (err) {
    console.error("getReferralLeaderboard failed:", err);
    return { ok: false, rows: [], totalReferrals: 0, activeRecruiters: 0 };
  }
}
