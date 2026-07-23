import "server-only";
import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { withRetry } from "@/lib/retry";
import {
  communities,
  communityMembers,
  conversationMembers,
  conversations,
  lgas,
  messages,
  profiles,
  states,
  users,
} from "@/db/schema";

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
  avatar: string | null;
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

/**
 * Seat a user in a group conversation. Exactly-once "X joined" system
 * message: onConflictDoNothing + RETURNING yields a row only on the insert
 * that actually seated them, so re-opens never repeat the announcement.
 */
async function seatInConversation(conversationId: string, userId: string): Promise<void> {
  const seated = await db
    .insert(conversationMembers)
    .values({ conversationId, userId })
    .onConflictDoNothing()
    .returning({ userId: conversationMembers.userId });
  if (seated.length === 0) return; // already seated

  try {
    const [who] = await db
      .select({ name: profiles.fullName, email: users.email })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    const name = who?.name?.trim() || who?.email?.split("@")[0] || "A member";
    await db.insert(messages).values({
      conversationId,
      senderId: userId,
      body: `${name} joined the community`,
      media: { kind: "system", systemEvent: "joined" },
      deliveredAt: new Date(),
    });
  } catch (err) {
    // The seat succeeded; a missing announcement must not break the join.
    console.error("join announcement failed:", err);
  }
}

/** Add a member (idempotent) and refresh the community's member_count.
 *  Also seats them in the community's group chat if it already exists. */
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
  const [c] = await db
    .select({ conversationId: communities.conversationId })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (c?.conversationId) {
    await seatInConversation(c.conversationId, userId);
  }
}

/**
 * The community's group conversation, created lazily on first open.
 * Race-safe: of two concurrent creators only the UPDATE that flips
 * conversation_id from NULL wins; the loser deletes its orphan and re-reads.
 */
export async function ensureCommunityConversation(communityId: string): Promise<string | null> {
  const [c] = await db
    .select({ conversationId: communities.conversationId, name: communities.name })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (!c) return null;
  if (c.conversationId) return c.conversationId;

  const [convo] = await db
    .insert(conversations)
    .values({ type: "group", title: c.name })
    .returning({ id: conversations.id });
  const claimed = await db
    .update(communities)
    .set({ conversationId: convo.id })
    .where(and(eq(communities.id, communityId), isNull(communities.conversationId)))
    .returning({ id: communities.id });
  if (claimed.length) return convo.id;

  await db.delete(conversations).where(eq(conversations.id, convo.id)); // lost the race
  const [winner] = await db
    .select({ conversationId: communities.conversationId })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  return winner?.conversationId ?? null;
}

export interface CommunityChatHandle {
  conversationId: string;
  name: string;
  memberCount: number;
  scope: CommunityScope;
}

/** Seat a community member in the group chat (community members only).
 *  Never throws — a rejected promise here previously left the client's
 *  un-caught `.then()` stuck on "joining…" forever with no recovery.
 *  `transient: true` tells the client to retry rather than show a
 *  permanent-looking error. */
export async function openCommunityChatFor(
  userId: string,
  communityId: string,
): Promise<{ ok: boolean; chat?: CommunityChatHandle; error?: string; transient?: boolean }> {
  try {
    const [membership] = await withRetry(() =>
      db
        .select({ role: communityMembers.role })
        .from(communityMembers)
        .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
        .limit(1),
    );
    if (!membership) return { ok: false, error: "Only members of this community can join its chat." };

    const conversationId = await withRetry(() => ensureCommunityConversation(communityId));
    if (!conversationId) return { ok: false, error: "Community not found." };

    await withRetry(() => seatInConversation(conversationId, userId));

    const [c] = await withRetry(() =>
      db
        .select({ name: communities.name, memberCount: communities.memberCount, scope: communities.scope })
        .from(communities)
        .where(eq(communities.id, communityId))
        .limit(1),
    );
    return {
      ok: true,
      chat: {
        conversationId,
        name: c?.name ?? "Community",
        memberCount: c?.memberCount ?? 0,
        scope: (c?.scope as CommunityScope) ?? "interest",
      },
    };
  } catch (err) {
    console.error("openCommunityChatFor failed (returning transient error):", err);
    return { ok: false, error: "Couldn't reach the server — retrying…", transient: true };
  }
}

interface GeoTarget {
  slug: string;
  name: string;
  scope: CommunityScope;
  scopeRefId?: string | null;
  description: string;
}

/** The four geo communities a placement maps to (state → polling unit). */
function geoTargets(g: MemberGeo): GeoTarget[] {
  const targets: GeoTarget[] = [];

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
  return targets;
}

/**
 * Ensure the State › LGA › Ward › Polling Unit communities exist for this
 * member's placement and that they're a member of each. Idempotent — safe to
 * call on every registration and on every load (self-heals older accounts).
 *
 * This runs on every Communities/Profile tab open, so the common case (a
 * member who is already correctly placed — which is nearly always, after the
 * first run) has to be cheap: one query checks whether all target slugs are
 * already joined, and returns immediately if so. The expensive per-target
 * create+join path (~5 sequential queries each) only runs for whatever is
 * actually missing — new members, or a tier that didn't exist yet.
 */
export async function ensureGeoCommunities(userId: string, geo?: MemberGeo | null): Promise<void> {
  const g = geo ?? (await memberGeo(userId));
  if (!g) return;
  const targets = geoTargets(g);
  if (targets.length === 0) return;

  const slugs = targets.map((t) => t.slug);
  const already = await db
    .select({ slug: communities.slug })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(and(eq(communityMembers.userId, userId), inArray(communities.slug, slugs)));
  const haveSlugs = new Set(already.map((r) => r.slug));
  const missing = targets.filter((t) => !haveSlugs.has(t.slug));
  if (missing.length === 0) return; // fully placed already — one query, done

  for (const t of missing) {
    try {
      const id = await ensureCommunity(t);
      await joinCommunity(id, userId);
    } catch (err) {
      // Never let community placement break registration/login.
      console.error("ensureGeoCommunities failed for", t.slug, err);
    }
  }
}

/** Remove a member and refresh the community's member_count. Also removes
 *  them from the community's group chat so a mover stops seeing it. */
async function leaveCommunity(communityId: string, userId: string): Promise<void> {
  await db
    .delete(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
  await db
    .update(communities)
    .set({
      memberCount: sql`(select count(*)::int from ${communityMembers} where ${communityMembers.communityId} = ${communityId})`,
    })
    .where(eq(communities.id, communityId));
  const [c] = await db
    .select({ conversationId: communities.conversationId })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (c?.conversationId) {
    await db
      .delete(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, c.conversationId), eq(conversationMembers.userId, userId)),
      );
  }
}

/**
 * Re-place a member after their State/LGA/Ward/Polling-Unit changes: leave
 * every geo-scoped community that no longer matches the new placement, then
 * join the new ones. Interest communities and roles above "member" are never
 * touched — a coordinator moving house keeps the groups they administer.
 */
export async function syncGeoCommunities(userId: string): Promise<void> {
  const g = await memberGeo(userId);
  if (!g) return;
  const targetSlugs = new Set(geoTargets(g).map((t) => t.slug));

  const memberships = await db
    .select({
      communityId: communities.id,
      slug: communities.slug,
      role: communityMembers.role,
    })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(
      and(
        eq(communityMembers.userId, userId),
        inArray(communities.scope, ["state", "lga", "ward", "polling_unit"]),
      ),
    );

  for (const m of memberships) {
    if (!targetSlugs.has(m.slug) && m.role === "member") {
      try {
        await leaveCommunity(m.communityId, userId);
      } catch (err) {
        console.error("syncGeoCommunities: leave failed for", m.slug, err);
      }
    }
  }

  await ensureGeoCommunities(userId, g);
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

/** Total unread messages across every community group chat this member is
 *  in — drives the Communities nav badge. Mirrors call-db.ts's `unreadFor`
 *  (which is DIRECT chats only, by design), just for `type: "group"`. */
export async function unreadCommunityMessagesFor(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, userId)),
    )
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(conversations.type, "group"),
        ne(messages.senderId, userId),
        // system events ("X joined") never count as unread
        sql`(${messages.media}->>'kind') IS DISTINCT FROM 'system'`,
        or(isNull(conversationMembers.lastReadAt), gt(messages.createdAt, conversationMembers.lastReadAt)),
      ),
    );
  return row?.n ?? 0;
}

/** Unread count PER community group chat (keyed by community id) — drives
 *  the per-row badge in the Communities list, same idea as the per-
 *  conversation unread badge in Messages. Only communities whose chat has
 *  actually been opened at least once have a `conversationId` at all; ones
 *  that don't simply have no entry (0 unread), which is correct. */
export async function unreadByCommunityFor(userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ communityId: communities.id, n: sql<number>`count(*)::int` })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .innerJoin(messages, eq(messages.conversationId, communities.conversationId))
    .innerJoin(
      conversationMembers,
      and(eq(conversationMembers.conversationId, communities.conversationId), eq(conversationMembers.userId, userId)),
    )
    .where(
      and(
        eq(communityMembers.userId, userId),
        ne(messages.senderId, userId),
        // system events ("X joined") never count as unread
        sql`(${messages.media}->>'kind') IS DISTINCT FROM 'system'`,
        or(isNull(conversationMembers.lastReadAt), gt(messages.createdAt, conversationMembers.lastReadAt)),
      ),
    )
    .groupBy(communities.id);
  return Object.fromEntries(rows.map((r) => [r.communityId, r.n]));
}

/** Members of a community (for counts and coordinator dashboards). */
export async function communityMemberList(communityId: string, limit = 200): Promise<CommunityMemberDTO[]> {
  const rows = await db
    .select({
      id: users.id,
      name: profiles.fullName,
      email: users.email,
      avatar: profiles.avatarUrl,
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
    avatar: r.avatar,
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
