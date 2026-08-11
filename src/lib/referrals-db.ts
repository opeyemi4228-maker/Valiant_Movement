import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { identities, lgas, profiles, states } from "@/db/schema";
import {
  generateReferralCode,
  normalizeReferralCode,
  tierForCount,
  REWARD_TIERS,
  type RewardTier,
} from "./referrals";
import { creditReferralBonus } from "./wallet-db";

/* ============================================================
   Referral reads/writes — counts and the leaderboard are derived
   from profiles.referred_by, so they're always correct with no
   separate counter to drift.
   ============================================================ */

/** Ensure a member has a referral code, returning it. Idempotent, with a
 *  couple of retries in the (tiny) chance of a random-code collision. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const [row] = await db
    .select({ code: profiles.referralCode })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (row?.code) return row.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const updated = await db
        .update(profiles)
        .set({ referralCode: code })
        .where(and(eq(profiles.userId, userId), sql`${profiles.referralCode} is null`))
        .returning({ code: profiles.referralCode });
      if (updated[0]?.code) return updated[0].code;
      // Someone set it concurrently — read it back.
      const [again] = await db
        .select({ code: profiles.referralCode })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);
      if (again?.code) return again.code;
    } catch {
      // unique collision on the code — try a fresh one
    }
  }
  throw new Error("could not allocate a referral code");
}

/** Resolve a referral code to the referrer's userId (null if unknown / self). */
export async function resolveReferrer(rawCode: string, selfId?: string): Promise<string | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const [row] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.referralCode, code))
    .limit(1);
  if (!row) return null;
  if (selfId && row.userId === selfId) return null; // can't refer yourself
  return row.userId;
}

export interface ReferredMember {
  userId: string;
  name: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
  verified: boolean;
  joinedAt: string;
}

export interface ReferralOverview {
  code: string;
  total: number;
  thisMonth: number;
  tier: RewardTier;
  referrals: ReferredMember[];
}

/** A member's own referral picture: their code, how many they've brought in
 *  (all-time + this month), their reward tier, and the full list. */
export async function getReferralOverview(userId: string): Promise<ReferralOverview> {
  const code = await ensureReferralCode(userId);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [[tot], [month], list] = await Promise.all([
    db.select({ n: count() }).from(profiles).where(eq(profiles.referredBy, userId)),
    db
      .select({ n: count() })
      .from(profiles)
      .where(and(eq(profiles.referredBy, userId), gte(profiles.createdAt, monthStart))),
    db
      .select({
        userId: profiles.userId,
        name: profiles.fullName,
        state: states.name,
        lga: lgas.name,
        ward: profiles.ward,
        verified: sql<boolean>`${identities.verificationStatus} = 'verified'`,
        joinedAt: profiles.createdAt,
      })
      .from(profiles)
      .leftJoin(states, eq(states.id, profiles.stateId))
      .leftJoin(lgas, eq(lgas.id, profiles.lgaId))
      .leftJoin(identities, eq(identities.userId, profiles.userId))
      .where(eq(profiles.referredBy, userId))
      .orderBy(desc(profiles.createdAt))
      .limit(200),
  ]);

  const total = tot.n;
  return {
    code,
    total,
    thisMonth: month.n,
    tier: tierForCount(total),
    referrals: list.map((r) => ({
      userId: r.userId,
      name: r.name,
      state: r.state,
      lga: r.lga,
      ward: r.ward,
      verified: !!r.verified,
      joinedAt: new Date(r.joinedAt).toISOString(),
    })),
  };
}

/**
 * Grant a recruiter any reward-tier bonuses they've now earned. Idempotent —
 * each tier's bonus is credited to their wallet exactly once (gated by a
 * per-tier reference), so this is safe to call after every new referral and
 * it self-heals any tier that was missed. Returns the tiers newly granted.
 */
export async function grantReferralRewards(referrerId: string): Promise<RewardTier[]> {
  const [{ n: total }] = await db
    .select({ n: count() })
    .from(profiles)
    .where(eq(profiles.referredBy, referrerId));

  const granted: RewardTier[] = [];
  for (const tier of REWARD_TIERS) {
    if (tier.bonusNaira <= 0 || total < tier.min) continue;
    const isNew = await creditReferralBonus(
      referrerId,
      tier.bonusNaira,
      tier.key,
      `${tier.emoji} ${tier.name} reward — ${tier.min}+ members brought to the movement`,
    );
    if (isNew) granted.push(tier);
  }
  return granted;
}

export interface LeaderboardScope {
  stateName?: string | null;
  lgaName?: string | null;
  ward?: string | null;
}

export interface LeaderRow {
  userId: string;
  name: string;
  state: string | null;
  lga: string | null;
  ward: string | null;
  total: number;
  thisMonth: number;
  tier: RewardTier;
}

export interface LeaderboardResult {
  rows: LeaderRow[];
  totalReferrals: number; // sum across the jurisdiction
  activeRecruiters: number; // members with >= 1 referral
}

/**
 * Top recruiters within a jurisdiction — every member ranked by how many people
 * they brought in. Scoped so a State coordinator only sees their state, an LGA
 * coordinator only their LGA, a Ward Captain only their ward. National sees all.
 */
export async function referralLeaderboard(
  scope: LeaderboardScope,
  limit = 50,
): Promise<LeaderboardResult> {
  const referred = alias(profiles, "referred"); // people the recruiter brought in
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const conds = [];
  if (scope.stateName) conds.push(eq(states.name, scope.stateName));
  if (scope.lgaName) conds.push(eq(lgas.name, scope.lgaName));
  if (scope.ward) conds.push(eq(profiles.ward, scope.ward));

  const rows = await db
    .select({
      userId: profiles.userId,
      name: profiles.fullName,
      state: states.name,
      lga: lgas.name,
      ward: profiles.ward,
      total: count(referred.userId),
      thisMonth: sql<number>`count(${referred.userId}) filter (where ${referred.createdAt} >= ${monthStart})`,
    })
    .from(profiles)
    .leftJoin(states, eq(states.id, profiles.stateId))
    .leftJoin(lgas, eq(lgas.id, profiles.lgaId))
    .leftJoin(referred, eq(referred.referredBy, profiles.userId))
    .where(conds.length ? and(...conds) : sql`true`)
    .groupBy(profiles.userId, profiles.fullName, states.name, lgas.name, profiles.ward)
    .orderBy(desc(count(referred.userId)), desc(sql`count(${referred.userId}) filter (where ${referred.createdAt} >= ${monthStart})`))
    .limit(limit);

  const ranked = rows
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      state: r.state,
      lga: r.lga,
      ward: r.ward,
      total: Number(r.total),
      thisMonth: Number(r.thisMonth),
      tier: tierForCount(Number(r.total)),
    }))
    .filter((r) => r.total > 0);

  return {
    rows: ranked,
    totalReferrals: ranked.reduce((s, r) => s + r.total, 0),
    activeRecruiters: ranked.length,
  };
}
