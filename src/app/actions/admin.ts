"use server";

import { and, count, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  communities,
  communityMembers,
  identities,
  lgas,
  memberReports,
  posts,
  profiles,
  states,
  users,
} from "@/db/schema";
import { getAdminSession } from "@/lib/admin-auth";
import { listPosts } from "@/lib/feed-db";
import type { FeedPost } from "@/lib/feed-types";
import {
  getTreasury as readTreasury,
  treasuryLedger,
  ensureStructureReservedAccount,
  type StructureNode,
  type TreasuryView,
  type TreasuryLedgerRow,
} from "@/lib/wallet-db";
import { withRetry } from "@/lib/retry";
import {
  communityMemberList,
  communitiesBySlugs,
  slugify,
  CONTROLLED_BY,
  type CommunityDTO,
  type CommunityMemberDTO,
} from "@/lib/communities";
import type { AdminScope } from "@/data/admin-roles";

/* ============================================================
   Admin dashboard — real data, scoped by the signed-in
   coordinator's jurisdiction (state/lga/ward/national).

   Every export here re-derives the caller's scope from the
   verified admin session cookie (getAdminSession()) — it NEVER
   trusts a scope passed in from the client, so a Ward Captain's
   browser can't just ask for the National view.
   ============================================================ */

export interface AdminMemberRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  state: string;
  lga: string;
  ward: string | null;
  status: string;
  verified: boolean;
  /** Role within the jurisdiction's own community — null at national
   *  level, where there's no single community to hold a role in. */
  communityRole: "owner" | "admin" | "moderator" | "member" | null;
  joinedAt: string; // ISO
}

async function requireAdminRole() {
  const session = await getAdminSession();
  return session?.role ?? null;
}

/** The ONE community that matches a scoped admin's jurisdiction — null for
 *  national (they browse every community instead of holding one). Slugs are
 *  deterministic (see lib/communities.ts geoTargets), so this is a single
 *  indexed lookup, not a scan. */
async function communityForScope(scope: AdminScope): Promise<CommunityDTO | null> {
  let slug: string | null = null;
  if (scope.level === "state" && scope.state) {
    slug = `state-${slugify(scope.state)}`;
  } else if (scope.level === "lga" && scope.state && scope.lga) {
    slug = `lga-${slugify(scope.state)}-${slugify(scope.lga)}`;
  } else if (scope.level === "ward" && scope.state && scope.lga && scope.ward) {
    slug = `ward-${slugify(scope.state)}-${slugify(scope.lga)}-${slugify(scope.ward)}`;
  }
  if (!slug) return null;
  const [c] = await communitiesBySlugs([slug]);
  return c ?? null;
}

function scopeConditions(scope: AdminScope) {
  const conditions = [];
  if (scope.state) conditions.push(eq(states.name, scope.state));
  if (scope.lga) conditions.push(eq(lgas.name, scope.lga));
  if (scope.ward) conditions.push(eq(profiles.ward, scope.ward));
  return conditions;
}

/* -------------------------- Treasury (§7.2) -------------------------- */

/** The coordinator's own structure node, resolved from their scoped session. */
async function coordinatorNode(scope: AdminScope): Promise<StructureNode | null> {
  if (scope.level === "national") return { key: "national", level: "national", name: "National HQ" };
  if (!scope.state) return null;
  const [st] = await db.select({ id: states.id }).from(states).where(eq(states.name, scope.state)).limit(1);
  if (!st) return null;
  if (scope.level === "state") {
    return { key: `state:${st.id}`, level: "state", name: `${scope.state} State`, stateId: st.id };
  }
  if (!scope.lga) return null;
  const [lg] = await db
    .select({ id: lgas.id })
    .from(lgas)
    .where(and(eq(lgas.stateId, st.id), eq(lgas.name, scope.lga)))
    .limit(1);
  if (!lg) return null;
  if (scope.level === "lga") {
    return { key: `lga:${lg.id}`, level: "lga", name: `${scope.lga} LGA`, stateId: st.id, lgaId: lg.id };
  }
  if (scope.level === "ward" && scope.ward) {
    return { key: `ward:${lg.id}:${scope.ward}`, level: "ward", name: scope.ward, stateId: st.id, lgaId: lg.id, ward: scope.ward };
  }
  return null;
}

export interface TreasuryResult {
  ok: boolean;
  treasury?: TreasuryView;
  ledger?: TreasuryLedgerRow[];
  jurisdiction?: string;
  error?: boolean;
}

/**
 * The coordinator's own treasury: real balance (fed by the 50/20/20/10 dues
 * split), its dedicated account number (provisioned on demand), and the
 * statement of everything that flowed through it. Scoped to the signed-in
 * coordinator's jurisdiction — never trusts a client-supplied scope.
 */
export async function getTreasury(): Promise<TreasuryResult> {
  const role = await requireAdminRole();
  if (!role) return { ok: false };
  try {
    const node = await coordinatorNode(role.scope);
    if (!node) return { ok: false, error: true };
    const treasury = await withRetry(() => readTreasury(node));

    // Best-effort: give the treasury its own dedicated account for funding.
    let reservedAccounts = treasury.reservedAccounts;
    if (reservedAccounts.length === 0) {
      try {
        const email = `treasury-${treasury.key.replace(/[^a-z0-9]+/gi, "-")}@valiantmovement.com`;
        reservedAccounts = (await ensureStructureReservedAccount(treasury.id, treasury.key, treasury.name, email)) ?? [];
      } catch (err) {
        console.error("treasury reserved provisioning failed (non-fatal):", err);
      }
    }

    const ledger = await withRetry(() => treasuryLedger(treasury.id));
    return { ok: true, treasury: { ...treasury, reservedAccounts }, ledger, jurisdiction: role.jurisdiction };
  } catch (err) {
    console.error("getTreasury failed:", err);
    return { ok: false, error: true };
  }
}

/* ---------------------- Community feed monitor ---------------------- */

export interface CommunityMonitorStats {
  communities: number;
  members: number;
  online: number; // active in the last 5 minutes
  postsToday: number;
  needsReview: number; // open member reports + flagged posts
}

export interface CommunityMonitor {
  ok: boolean;
  stats?: CommunityMonitorStats;
  /** The real member feed — the exact posts members see, newest first. */
  posts?: FeedPost[];
  error?: boolean;
}

/** A well-formed UUID that matches no user, so listPosts' reaction lookups
 *  come back empty (an admin monitor has no "liked/bookmarked" state). */
const MONITOR_VIEWER = "00000000-0000-0000-0000-000000000000";

/**
 * Live health of the whole community for the Feed monitor — real counts and
 * the actual member feed, in sync with what members see. Movement-wide (this
 * is the "watch everything" panel; per-jurisdiction breakdowns live in
 * Associations / Members). Never throws — a transient failure returns
 * { ok:false, error:true } so the client can show a retry state.
 */
export async function getCommunityMonitor(): Promise<CommunityMonitor> {
  const role = await requireAdminRole();
  if (!role) return { ok: false };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const onlineSince = new Date(Date.now() - 5 * 60 * 1000);

  try {
    const [stats, feed] = await Promise.all([
      withRetry(async () => {
        const [[c], [m], [on], [pt], [rep], [fp]] = await Promise.all([
          db.select({ n: count() }).from(communities),
          db.select({ n: count() }).from(users),
          db.select({ n: count() }).from(users).where(gte(users.lastActiveAt, onlineSince)),
          db
            .select({ n: count() })
            .from(posts)
            .where(and(isNull(posts.parentId), gte(posts.createdAt, startOfDay))),
          db.select({ n: count() }).from(memberReports).where(eq(memberReports.status, "open")),
          db.select({ n: count() }).from(posts).where(isNotNull(posts.flaggedAt)),
        ]);
        return {
          communities: c.n,
          members: m.n,
          online: on.n,
          postsToday: pt.n,
          needsReview: rep.n + fp.n,
        };
      }),
      // includeHidden: the monitor shows hidden posts too, so a coordinator can
      // reverse a hide. Members never see them (listPosts excludes by default).
      withRetry(() => listPosts(MONITOR_VIEWER, 20, { includeHidden: true })),
    ]);

    return { ok: true, stats, posts: feed };
  } catch (err) {
    console.error("getCommunityMonitor failed:", err);
    return { ok: false, error: true };
  }
}

export interface ModerationResult {
  ok: boolean;
  pinned?: boolean;
  hidden?: boolean;
  flagged?: boolean;
}

/**
 * Toggle a coordinator moderation action on a post from the Feed monitor.
 * Each action flips its own timestamp (set → now, unset → null) in a single
 * statement, and returns the post's resulting state so the UI reflects reality
 * without a refetch. Hiding removes the post from every member's feed; pinning
 * floats it to the top; flagging queues it for review.
 */
export async function moderatePost(
  postId: string,
  action: "pin" | "hide" | "flag",
): Promise<ModerationResult> {
  const role = await requireAdminRole();
  if (!role) return { ok: false };

  const toggle =
    action === "pin"
      ? { pinnedAt: sql`CASE WHEN ${posts.pinnedAt} IS NULL THEN now() ELSE NULL END` }
      : action === "hide"
      ? { hiddenAt: sql`CASE WHEN ${posts.hiddenAt} IS NULL THEN now() ELSE NULL END` }
      : { flaggedAt: sql`CASE WHEN ${posts.flaggedAt} IS NULL THEN now() ELSE NULL END` };

  try {
    const [row] = await withRetry(() =>
      db
        .update(posts)
        .set(toggle)
        .where(eq(posts.id, postId))
        .returning({
          pinnedAt: posts.pinnedAt,
          hiddenAt: posts.hiddenAt,
          flaggedAt: posts.flaggedAt,
        }),
    );
    if (!row) return { ok: false };
    return { ok: true, pinned: !!row.pinnedAt, hidden: !!row.hiddenAt, flagged: !!row.flaggedAt };
  } catch (err) {
    console.error("moderatePost failed:", err);
    return { ok: false };
  }
}

/** Every real member in the caller's jurisdiction, with their role in that
 *  jurisdiction's own community. Never throws — a transient failure returns
 *  null so the client can show a retry state instead of hanging. */
export async function getAdminMembers(): Promise<{
  items: AdminMemberRow[];
  community: CommunityDTO | null;
} | null> {
  const role = await requireAdminRole();
  if (!role) return null;

  try {
    const [rows, community] = await withRetry(() =>
      Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            phone: users.phone,
            status: users.status,
            createdAt: users.createdAt,
            fullName: profiles.fullName,
            state: states.name,
            lga: lgas.name,
            ward: profiles.ward,
            verificationStatus: identities.verificationStatus,
          })
          .from(users)
          .leftJoin(profiles, eq(profiles.userId, users.id))
          .leftJoin(states, eq(states.id, profiles.stateId))
          .leftJoin(lgas, eq(lgas.id, profiles.lgaId))
          .leftJoin(identities, eq(identities.userId, users.id))
          .where(scopeConditions(role.scope).length ? and(...scopeConditions(role.scope)) : undefined)
          .orderBy(desc(users.createdAt)),
        communityForScope(role.scope),
      ]),
    );

    const roleByUserId = new Map<string, CommunityMemberDTO["role"]>();
    if (community) {
      const roster = await communityMemberList(community.id, 5000);
      for (const m of roster) roleByUserId.set(m.id, m.role);
    }

    const items: AdminMemberRow[] = rows.map((r) => ({
      id: r.id,
      name: r.fullName?.trim() || r.email.split("@")[0],
      email: r.email,
      phone: r.phone,
      state: r.state ?? "—",
      lga: r.lga ?? "—",
      ward: r.ward,
      status: r.status,
      verified: r.verificationStatus === "verified",
      communityRole: community ? roleByUserId.get(r.id) ?? "member" : null,
      joinedAt: new Date(r.createdAt).toISOString(),
    }));

    return { items, community };
  } catch (err) {
    console.error("getAdminMembers failed:", err);
    return null;
  }
}

/** CSV of members who joined within [from, to] (inclusive), scoped to the
 *  caller's jurisdiction — what a lower coordinator downloads for a
 *  concrete roster of who's new. Dates are ISO ("2026-01-01"). */
export async function exportAdminMembersCsv(
  from: string,
  to: string,
): Promise<{ ok: boolean; csv?: string; filename?: string; error?: string }> {
  const role = await requireAdminRole();
  if (!role) return { ok: false, error: "Not signed in." };

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return { ok: false, error: "Pick a valid date range." };
  }

  try {
    const conditions = [...scopeConditions(role.scope), gte(users.createdAt, fromDate), lte(users.createdAt, toDate)];
    const rows = await withRetry(() =>
      db
        .select({
          fullName: profiles.fullName,
          email: users.email,
          phone: users.phone,
          state: states.name,
          lga: lgas.name,
          ward: profiles.ward,
          pollingUnit: profiles.pollingUnit,
          status: users.status,
          verificationStatus: identities.verificationStatus,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .leftJoin(states, eq(states.id, profiles.stateId))
        .leftJoin(lgas, eq(lgas.id, profiles.lgaId))
        .leftJoin(identities, eq(identities.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(users.createdAt)),
    );

    const header = ["Full name", "Email", "Phone", "State", "LGA", "Ward", "Polling unit", "Status", "NIN verified", "Joined"];
    const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.fullName ?? "",
          r.email,
          r.phone ?? "",
          r.state ?? "",
          r.lga ?? "",
          r.ward ?? "",
          r.pollingUnit ?? "",
          r.status,
          r.verificationStatus === "verified" ? "Yes" : "No",
          new Date(r.createdAt).toISOString().slice(0, 10),
        ]
          .map((v) => csvEscape(String(v)))
          .join(","),
      );
    }

    const jurisdictionSlug = slugify(role.jurisdiction || role.roleName);
    return {
      ok: true,
      csv: lines.join("\n"),
      filename: `members-${jurisdictionSlug}-${from}_to_${to}.csv`,
    };
  } catch (err) {
    console.error("exportAdminMembersCsv failed:", err);
    return { ok: false, error: "Couldn't build the export — try again." };
  }
}

/** Promote/demote a real member's role within the caller's jurisdiction
 *  community — this IS the "coordinator" (owner/admin) and "delegate"
 *  (moderator) designation the huddle-start gate checks. Authorization is
 *  server-verified: only the admin whose jurisdiction owns this exact
 *  community (or national) can change roles in it. */
export async function setCommunityMemberRole(
  communityId: string,
  memberId: string,
  role: "owner" | "admin" | "moderator" | "member",
): Promise<{ ok: boolean; error?: string }> {
  const adminRole = await requireAdminRole();
  if (!adminRole) return { ok: false, error: "Not signed in." };

  if (adminRole.scope.level !== "national") {
    const own = await communityForScope(adminRole.scope);
    if (!own || own.id !== communityId) {
      return { ok: false, error: "You can only manage roles in your own jurisdiction's community." };
    }
  }

  const [existing] = await db
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, memberId)))
    .limit(1);
  if (!existing) return { ok: false, error: "That member isn't part of this community." };

  await db
    .update(communityMembers)
    .set({ role })
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, memberId)));

  return { ok: true };
}

/** National only: every real community in the movement, for the "enter any
 *  community" browser. Scoped admins get an empty list (they only ever see
 *  their own community, via getAdminMembers()'s `community` field). */
export async function getAllCommunitiesAdmin(): Promise<CommunityDTO[]> {
  const role = await requireAdminRole();
  if (!role || role.scope.level !== "national") return [];
  try {
    const rows = await withRetry(() => db.select().from(communities).orderBy(communities.scope, communities.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      scope: r.scope,
      description: r.description,
      memberCount: r.memberCount,
      role: null,
      controlledBy: CONTROLLED_BY[r.scope],
    }));
  } catch (err) {
    console.error("getAllCommunitiesAdmin failed:", err);
    return [];
  }
}

/** National only: drill into any single community's real roster. */
export async function getCommunityRosterAdmin(communityId: string): Promise<CommunityMemberDTO[] | null> {
  const role = await requireAdminRole();
  if (!role || role.scope.level !== "national") return null;
  try {
    return await communityMemberList(communityId, 5000);
  } catch (err) {
    console.error("getCommunityRosterAdmin failed:", err);
    return null;
  }
}
