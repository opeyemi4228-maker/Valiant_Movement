import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { coordinatorActivities, lgas, states } from "@/db/schema";
import type { AdminScope } from "@/data/admin-roles";

/* Coordinator field-activity log — DB reads/writes. */

export type ActivityLevel = "ward" | "lga" | "state" | "national";

export interface ActivityDTO {
  id: string;
  level: ActivityLevel;
  authorTitle: string;
  jurisdiction: string;
  body: string;
  image: string | null;
  createdAt: string;
}

/** Resolve a coordinator's scope (which carries names) to geo ids + a label. */
async function resolveScope(scope: AdminScope): Promise<{
  stateId: string | null;
  lgaId: string | null;
  ward: string | null;
  jurisdiction: string;
}> {
  let stateId: string | null = null;
  let lgaId: string | null = null;
  if (scope.state) {
    const [s] = await db.select({ id: states.id }).from(states).where(eq(states.name, scope.state)).limit(1);
    stateId = s?.id ?? null;
    if (stateId && scope.lga) {
      const [l] = await db
        .select({ id: lgas.id })
        .from(lgas)
        .where(and(eq(lgas.stateId, stateId), eq(lgas.name, scope.lga)))
        .limit(1);
      lgaId = l?.id ?? null;
    }
  }
  const jurisdiction =
    [scope.ward, scope.lga && `${scope.lga} LGA`, scope.state && `${scope.state} State`]
      .filter(Boolean)
      .join(" · ") || "National";
  return { stateId, lgaId, ward: scope.ward ?? null, jurisdiction };
}

/** Record a coordinator's activity, stamped with their jurisdiction. */
export async function createActivity(input: {
  scope: AdminScope;
  roleKey: string;
  authorTitle: string;
  body: string;
  image?: string | null;
}): Promise<ActivityDTO> {
  const geo = await resolveScope(input.scope);
  const [row] = await db
    .insert(coordinatorActivities)
    .values({
      level: input.scope.level,
      roleKey: input.roleKey,
      authorTitle: input.authorTitle,
      jurisdiction: geo.jurisdiction,
      stateId: geo.stateId,
      lgaId: geo.lgaId,
      ward: geo.ward,
      body: input.body.trim().slice(0, 2000),
      image: input.image ?? null,
    })
    .returning();
  return toDTO(row);
}

function toDTO(r: typeof coordinatorActivities.$inferSelect): ActivityDTO {
  return {
    id: r.id,
    level: r.level as ActivityLevel,
    authorTitle: r.authorTitle,
    jurisdiction: r.jurisdiction,
    body: r.body,
    image: r.image,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

/** A coordinator's own log — activities at their level within their jurisdiction. */
export async function activitiesForScope(scope: AdminScope, limit = 100): Promise<ActivityDTO[]> {
  const geo = await resolveScope(scope);
  const conds = [eq(coordinatorActivities.level, scope.level)];
  if (scope.level !== "national") {
    conds.push(geo.stateId ? eq(coordinatorActivities.stateId, geo.stateId) : isNull(coordinatorActivities.stateId));
  }
  if (scope.level === "lga" || scope.level === "ward") {
    conds.push(geo.lgaId ? eq(coordinatorActivities.lgaId, geo.lgaId) : isNull(coordinatorActivities.lgaId));
  }
  if (scope.level === "ward" && geo.ward) {
    conds.push(eq(coordinatorActivities.ward, geo.ward));
  }
  const rows = await db
    .select()
    .from(coordinatorActivities)
    .where(and(...conds))
    .orderBy(desc(coordinatorActivities.createdAt))
    .limit(limit);
  return rows.map(toDTO);
}

/** Activities relevant to a member's feed: national + their state + their LGA +
 *  their ward, newest first. */
export async function activitiesForMember(
  geo: { stateId: string | null; lgaId: string | null; ward: string | null },
  limit = 15,
): Promise<ActivityDTO[]> {
  const clauses = [eq(coordinatorActivities.level, "national")];
  if (geo.stateId) {
    clauses.push(and(eq(coordinatorActivities.level, "state"), eq(coordinatorActivities.stateId, geo.stateId))!);
  }
  if (geo.lgaId) {
    clauses.push(and(eq(coordinatorActivities.level, "lga"), eq(coordinatorActivities.lgaId, geo.lgaId))!);
    if (geo.ward) {
      clauses.push(
        and(
          eq(coordinatorActivities.level, "ward"),
          eq(coordinatorActivities.lgaId, geo.lgaId),
          eq(coordinatorActivities.ward, geo.ward),
        )!,
      );
    }
  }
  const rows = await db
    .select()
    .from(coordinatorActivities)
    .where(or(...clauses))
    .orderBy(desc(coordinatorActivities.createdAt))
    .limit(limit);
  return rows.map(toDTO);
}
