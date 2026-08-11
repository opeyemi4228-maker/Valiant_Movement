/* ============================================================
   Referrals — every member carries a unique code; sharing it and
   getting someone to register with it credits the referrer. Counts
   and the leaderboard are derived from `profiles.referred_by`, and
   a member climbs reward TIERS as their count grows.

   This file holds the pure bits (code shape + reward tiers). The DB
   reads/writes live in referrals-db.ts (server-only).
   ============================================================ */

// No ambiguous characters (0/O, 1/I) so a code is easy to read out loud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short, human-friendly referral code, e.g. "VM-7QK4PH". */
export function generateReferralCode(): string {
  let body = "";
  for (let i = 0; i < 6; i++) body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `VM-${body}`;
}

/** Normalise user-entered codes (paste, casing, spaces) before lookup. */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/* ------------------------------ rewards ------------------------------ */

export interface RewardTier {
  key: string;
  name: string;
  min: number; // referrals needed to reach this tier
  /** One-off wallet bonus (whole naira) granted on reaching the tier. */
  bonusNaira: number;
  emoji: string;
}

/**
 * Reward ladder — recognition + a wallet bonus as a member brings more people
 * in. Encoded as data so it's auditable and tunable without code changes.
 * `min` is the referral count at which the tier unlocks.
 */
export const REWARD_TIERS: RewardTier[] = [
  { key: "recruit", name: "Recruit", min: 0, bonusNaira: 0, emoji: "🌱" },
  { key: "mobilizer", name: "Mobilizer", min: 20, bonusNaira: 5_000, emoji: "🤝" },
  { key: "organizer", name: "Organizer", min: 50, bonusNaira: 15_000, emoji: "📣" },
  { key: "vanguard", name: "Vanguard", min: 100, bonusNaira: 40_000, emoji: "🦅" },
  { key: "champion", name: "Champion", min: 200, bonusNaira: 100_000, emoji: "🏆" },
  { key: "legend", name: "Movement Legend", min: 1_000, bonusNaira: 500_000, emoji: "👑" },
];

/** The highest tier a member with `count` referrals has reached. */
export function tierForCount(count: number): RewardTier {
  let tier = REWARD_TIERS[0];
  for (const t of REWARD_TIERS) if (count >= t.min) tier = t;
  return tier;
}

/** The next tier to aim for (null once at the top), for a progress bar. */
export function nextTier(count: number): RewardTier | null {
  return REWARD_TIERS.find((t) => t.min > count) ?? null;
}

/** Every tier newly reached when a member goes from `prev` → `next` referrals.
 *  Used to grant the one-off bonuses exactly once as they cross thresholds. */
export function tiersCrossed(prev: number, next: number): RewardTier[] {
  return REWARD_TIERS.filter((t) => t.min > prev && t.min <= next && t.bonusNaira > 0);
}
