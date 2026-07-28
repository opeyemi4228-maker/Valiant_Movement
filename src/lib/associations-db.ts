import "server-only";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { lgas, profiles, states } from "@/db/schema";

/* ============================================================
   Associations / Chapters — live membership rolled up the geo
   hierarchy from the `profiles` table:

     States  →  LGAs  →  Wards  →  Polling Units

   Counts are real (every registered member's placement), so a
   coordinator sees exactly how the movement is distributed
   across their jurisdiction. All 37 states / every LGA show up
   even at zero members; wards and polling units come from the
   members present (no full reference dataset for them yet).
   ============================================================ */

export type ChapterLevel = "states" | "lgas" | "wards" | "pollingUnits";

export interface ChapterRow {
  key: string; // id (state/lga) or name (ward/PU)
  name: string;
  count: number;
  drillable: boolean;
}

export interface ChapterPath {
  stateName?: string;
  lgaName?: string;
  ward?: string;
}

export interface ChapterView {
  level: ChapterLevel;
  rows: ChapterRow[];
  total: number; // members in this jurisdiction
  units: number; // number of sub-units listed
  populated: number; // sub-units with ≥1 member
  path: ChapterPath; // the effective (scope-clamped) path
}

const CHILD: Record<ChapterLevel, string> = {
  states: "state",
  lgas: "LGA",
  wards: "ward",
  pollingUnits: "polling unit",
};

export function childLabel(level: ChapterLevel): string {
  return CHILD[level];
}

async function stateIdByName(name: string): Promise<string | null> {
  const [s] = await db.select({ id: states.id }).from(states).where(eq(states.name, name)).limit(1);
  return s?.id ?? null;
}
async function lgaIdByName(stateId: string, name: string): Promise<string | null> {
  const [l] = await db
    .select({ id: lgas.id })
    .from(lgas)
    .where(and(eq(lgas.stateId, stateId), eq(lgas.name, name)))
    .limit(1);
  return l?.id ?? null;
}

function summarize(level: ChapterLevel, rows: ChapterRow[], path: ChapterPath): ChapterView {
  return {
    level,
    rows,
    total: rows.reduce((s, r) => s + r.count, 0),
    units: rows.length,
    populated: rows.filter((r) => r.count > 0).length,
    path,
  };
}

/** One level of the chapter tree, driven by how much of the path is filled. */
export async function chapterView(path: ChapterPath): Promise<ChapterView> {
  // ---- States (national view) ----
  if (!path.stateName) {
    const rows = await db
      .select({ key: states.id, name: states.name, count: sql<number>`count(${profiles.userId})::int` })
      .from(states)
      .leftJoin(profiles, eq(profiles.stateId, states.id))
      .groupBy(states.id, states.name)
      .orderBy(desc(sql`count(${profiles.userId})`), asc(states.name));
    return summarize("states", rows.map((r) => ({ ...r, drillable: true })), {});
  }

  const stateId = await stateIdByName(path.stateName);
  if (!stateId) return summarize("lgas", [], path);

  // ---- LGAs within a state ----
  if (!path.lgaName) {
    const rows = await db
      .select({ key: lgas.id, name: lgas.name, count: sql<number>`count(${profiles.userId})::int` })
      .from(lgas)
      .leftJoin(profiles, eq(profiles.lgaId, lgas.id))
      .where(eq(lgas.stateId, stateId))
      .groupBy(lgas.id, lgas.name)
      .orderBy(desc(sql`count(${profiles.userId})`), asc(lgas.name));
    return summarize("lgas", rows.map((r) => ({ ...r, drillable: true })), { stateName: path.stateName });
  }

  const lgaId = await lgaIdByName(stateId, path.lgaName);
  if (!lgaId) return summarize("wards", [], path);

  // ---- Wards within an LGA ----
  if (!path.ward) {
    const rows = await db
      .select({ name: profiles.ward, count: sql<number>`count(*)::int` })
      .from(profiles)
      .where(and(eq(profiles.lgaId, lgaId), isNotNull(profiles.ward)))
      .groupBy(profiles.ward)
      .orderBy(desc(sql`count(*)`));
    return summarize(
      "wards",
      rows.map((r) => ({ key: r.name ?? "", name: r.name ?? "—", count: r.count, drillable: true })),
      { stateName: path.stateName, lgaName: path.lgaName },
    );
  }

  // ---- Polling units within a ward (leaf) ----
  const rows = await db
    .select({ name: profiles.pollingUnit, count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(and(eq(profiles.lgaId, lgaId), eq(profiles.ward, path.ward), isNotNull(profiles.pollingUnit)))
    .groupBy(profiles.pollingUnit)
    .orderBy(desc(sql`count(*)`));
  return summarize(
    "pollingUnits",
    rows.map((r) => ({ key: r.name ?? "", name: r.name ?? "—", count: r.count, drillable: false })),
    { stateName: path.stateName, lgaName: path.lgaName, ward: path.ward },
  );
}
