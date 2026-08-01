/* ============================================================
   Membership dues + the structure revenue-share, straight from
   the handbook (§4.1 categories, §7.3 the 50/20/20/10 split).

   Both the per-category amount AND the split are DATA here, not
   logic — the handbook (§7.4) requires the split to be encoded
   as basis points so it's auditable and adjustable without a
   code change. Change a number here and every future charge
   follows it; past charges stay as they were recorded.
   ============================================================ */

export type MembershipCategory =
  | "student"
  | "regular"
  | "professional"
  | "diaspora"
  | "honorary"
  | "institutional";

/** Monthly dues in whole naira, by category (§4.1). 0 = non-charging.
 *  Diaspora is "to be set" in the handbook — 0 until a figure is fixed. */
export const DUES_BY_CATEGORY: Record<MembershipCategory, number> = {
  student: 0,
  regular: 2_000,
  professional: 10_000,
  diaspora: 0, // TODO: set once the handbook fixes the diaspora figure
  honorary: 0,
  institutional: 0,
};

export const DEFAULT_CATEGORY: MembershipCategory = "regular";

export function duesForCategory(category: MembershipCategory | null | undefined): number {
  return DUES_BY_CATEGORY[category ?? DEFAULT_CATEGORY] ?? 0;
}

export function isPayingCategory(category: MembershipCategory | null | undefined): boolean {
  return duesForCategory(category) > 0;
}

/* ---------------------------- the split ---------------------------- */

export type StructureLevel = "ward" | "lga" | "state" | "national";

/** The revenue-share, in basis points (parts per 10,000). Must sum to 10,000.
 *  Handbook §7.3: Ward 50% · LGA 20% · State 20% · National 10%. */
export const SPLIT_BP: Record<StructureLevel, number> = {
  ward: 5_000,
  lga: 2_000,
  state: 2_000,
  national: 1_000,
};

/** Order the shares flow down the structure — used for display and for the
 *  "authorized batch distribution" fan-out (§7.4). */
export const SPLIT_ORDER: StructureLevel[] = ["ward", "lga", "state", "national"];

// Fail loudly at module load if the basis points are ever edited to not sum to
// 100% — a silent drift here would lose or invent money on every charge.
const _bpTotal = SPLIT_ORDER.reduce((s, l) => s + SPLIT_BP[l], 0);
if (_bpTotal !== 10_000) {
  throw new Error(`dues SPLIT_BP must sum to 10000 basis points, got ${_bpTotal}`);
}

export type DuesShares = Record<StructureLevel, number>;

/**
 * Split a whole-naira amount across the four levels by SPLIT_BP, with no naira
 * lost or invented: each level gets floor(amount·bp/10000) and the rounding
 * remainder goes to the Ward (the grassroots, and the largest share). The
 * returned shares always sum back to exactly `amount`.
 */
export function computeShares(amount: number): DuesShares {
  const shares: DuesShares = { ward: 0, lga: 0, state: 0, national: 0 };
  let allocated = 0;
  for (const level of SPLIT_ORDER) {
    const share = Math.floor((amount * SPLIT_BP[level]) / 10_000);
    shares[level] = share;
    allocated += share;
  }
  // Hand the rounding remainder to the ward so the split is exact.
  shares.ward += amount - allocated;
  return shares;
}
