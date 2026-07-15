import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { communities, communityMembers, lgas, profiles, states, users } from "@/db/schema";

/* ============================================================
   Geo communities — WhatsApp-Community style.

   Every verified member is automatically a member of the four
   communities their registration places them in:

     State  ›  LGA  ›  Ward  ›  Polling Unit

   Communities are keyed by a deterministic `slug`, so ensuring
   them is idempotent and safe to run on every registration or
   page load. `member_count` is kept in sync after each join.

   Admin control follows the hierarchy:
     State community      → State Coordinator
     LGA group            → LGA Coordinator
     Ward + Polling Unit  → Ward Captain
   ============================================================ */

export type CommunityScope = "national" | "state" | "lga" | "ward" | "polling_unit" | "interest";

export interface CommunityDTO {
  id: string;
  name: string;
  slug: string;
  scope: CommunityScope;
  description: string | null;
  memberCount: number;
  /** The signed-in member's role in this community (null = not a member). */
  role: "owner" | "admin" | "moderator" | "member" | null;
  /** Who administers this level, e.g. "Ward Captain". */
  controlledBy: string;
}

export interface CommunityMemberDTO {
  id: string;
  name: string;
  role: "owner" | "admin" | "moderator" | "member";
  joinedAt: string;
}

/** Which coordinator administers each level. */
export const CONTROLLED_BY: Record<CommunityScope, string> = {
  national: "National Executive",
  state: "State Coordinator",
  lga: "LGA Coordinator",
  ward: "Ward Captain",
  polling_unit: "Ward Captain",
  interest: "Community Admin",
};

/** Display order: broadest → most local. */
export const SCOPE_RANK: Record<CommunityScope, number> = {
  national: 0,
  state: 1,
  lga: 2,
  ward: 3,
  polling_unit: 4,
  interest: 5,
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The member's geo, as captured at registration. */
export interface MemberGeo {
  stateId: string | null;
  stateName: string | null;
  lgaId: string | null;
  lgaName: string | null;
  ward: string | null;
  pollingUnit: string | null;
}

/** Read a member's geo placement (state/LGA names resolved). */
export async function memberGeo(userId: string): Promise<MemberGeo | null> {
  const [row] = await db
    .select({
      stateId: profiles.stateId,
      stateName: states.name,
      lgaId: profiles.lgaId,
      lgaName: lgas.name,
      ward: profiles.ward,
      pollingUnit: profiles.pollingUnit,
    })
    .from(profiles)
    .leftJoin(states, eq(states.id, profiles.stateId))
    .leftJoin(lgas, eq(lgas.id, profiles.lgaId))
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Create a community if it doesn't exist (idempotent by slug); returns its id. */
async function ensureCommunity(input: {
  slug: string;
  name: string;
  scope: CommunityScope;
  scopeRefId?: string | null;
  description: string;
}): Promise<string> {
  await db
    .insert(communities)
    .values({
      slug: input.slug,
      name: input.name,
      scope: input.scope,
      scopeRefId: input.scopeRefId ?? null,
      description: input.description,
      visibility: "public",
    })
    .onConflictDoNothing({ target: communities.slug });
  const [row] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.slug, input.slug))
    .limit(1);
  return row.id;
}

/** Add a member (idempotent) and refresh the community's member_count. */
async function joinCommunity(communityId: string, userId: string): Promise<void> {
  await db
    .insert(communityMembers)
    .values({ communityId, userId, role: "member" })
    .onConflictDoNothing();
  await db
    .update(communities)
    .set({
      memberCount: sql`(select count(*)::int from ${communityMembers} where ${communityMembers.communityId} = ${communityId})`,
    })
    .where(eq(communities.id, communityId));
}

/**
 * Ensure the State › LGA › Ward › Polling Unit communities exist for this
 * member's placement and that they're a member of each. Idempotent — safe to
 * call on every registration and on every load (self-heals older accounts).
 */
export async function ensureGeoCommunities(userId: string, geo?: MemberGeo | null): Promise<void> {
  const g = geo ?? (await memberGeo(userId));
  if (!g) return;

  const targets: { slug: string; name: string; scope: CommunityScope; scopeRefId?: string | null; description: string }[] = [];

  if (g.stateName) {
    targets.push({
      slug: `state-${slugify(g.stateName)}`,
      name: `${g.stateName} State Chapter`,
      scope: "state",
      scopeRefId: g.stateId,
      description: `Every verified Valiant in ${g.stateName} State. Announcements from your State Coordinator.`,
    });
  }
  if (g.stateName && g.lgaName) {
    targets.push({
      slug: `lga-${slugify(g.stateName)}-${slugify(g.lgaName)}`,
      name: `${g.lgaName} LGA`,
      scope: "lga",
      scopeRefId: g.lgaId,
      description: `Members across ${g.lgaName} LGA, ${g.stateName}. Coordinated by your LGA Coordinator.`,
    });
  }
  if (g.stateName && g.lgaName && g.ward) {
    targets.push({
      slug: `ward-${slugify(g.stateName)}-${slugify(g.lgaName)}-${slugify(g.ward)}`,
      name: g.ward,
      scope: "ward",
      description: `${g.ward}, ${g.lgaName} LGA. Your Ward Captain leads here.`,
    });
  }
  if (g.stateName && g.lgaName && g.ward && g.pollingUnit) {
    targets.push({
      slug: `pu-${slugify(g.stateName)}-${slugify(g.lgaName)}-${slugify(g.ward)}-${slugify(g.pollingUnit)}`,
      name: g.pollingUnit,
      scope: "polling_unit",
      description: `Polling unit ${g.pollingUnit} — the closest circle to home.`,
    });
  }

  for (const t of targets) {
    try {
      const id = await ensureCommunity(t);
      await joinCommunity(id, userId);
    } catch (err) {
      // Never let community placement break registration/login.
      console.error("ensureGeoCommunities failed for", t.slug, err);
    }
  }
}

/** The member's communities, broadest → most local, with live member counts. */
export async function myCommunities(userId: string): Promise<CommunityDTO[]> {
  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      scope: communities.scope,
      description: communities.description,
      memberCount: communities.memberCount,
      role: communityMembers.role,
    })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(eq(communityMembers.userId, userId));

  return rows
    .map((r) => ({
      ...r,
      scope: r.scope as CommunityScope,
      controlledBy: CONTROLLED_BY[r.scope as CommunityScope],
    }))
    .sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]);
}

/** Members of a community (for counts and coordinator dashboards). */
export async function communityMemberList(communityId: string, limit = 200): Promise<CommunityMemberDTO[]> {
  const rows = await db
    .select({
      id: users.id,
      name: profiles.fullName,
      email: users.email,
      role: communityMembers.role,
      joinedAt: communityMembers.joinedAt,
    })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(communityMembers.communityId, communityId))
    .orderBy(asc(communityMembers.joinedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name?.trim() || r.email.split("@")[0],
    role: r.role,
    joinedAt: new Date(r.joinedAt).toISOString(),
  }));
}

/** Look up communities by slug prefix — used by the coordinator dashboards. */
export async function communitiesBySlugs(slugs: string[]): Promise<CommunityDTO[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      scope: communities.scope,
      description: communities.description,
      memberCount: communities.memberCount,
    })
    .from(communities)
    .where(inArray(communities.slug, slugs));
  return rows
    .map((r) => ({
      ...r,
      scope: r.scope as CommunityScope,
      role: null,
      controlledBy: CONTROLLED_BY[r.scope as CommunityScope],
    }))
    .sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]);
}

/** Communities under a jurisdiction, e.g. every ward group in an LGA. */
export async function communitiesUnder(prefix: string, scope?: CommunityScope): Promise<CommunityDTO[]> {
  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      scope: communities.scope,
      description: communities.description,
      memberCount: communities.memberCount,
    })
    .from(communities)
    .where(
      scope
        ? and(sql`${communities.slug} like ${prefix + "%"}`, eq(communities.scope, scope))
        : sql`${communities.slug} like ${prefix + "%"}`,
    )
    .orderBy(asc(communities.name));
  return rows.map((r) => ({
    ...r,
    scope: r.scope as CommunityScope,
    role: null,
    controlledBy: CONTROLLED_BY[r.scope as CommunityScope],
  }));
}

export { slugify };
