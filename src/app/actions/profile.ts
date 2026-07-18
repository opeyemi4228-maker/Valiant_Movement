"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { lgas, profiles, states, users } from "@/db/schema";
import { getCurrentUser, getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import { syncGeoCommunities } from "@/lib/communities";
import * as mem from "@/lib/demo-store";
import type { ProfileDTO, ProfilePatch } from "@/lib/demo-store";

/* ============================================================
   Member profile — read + self-edit.

   Postgres for real members (usesDb), the in-memory store for
   demo sessions. A profile save is the single source of truth:
   the avatar/cover propagate everywhere (session, chat, feed
   all read profiles), and a State/LGA/Ward/Polling-Unit change
   automatically re-places the member in their geo communities.
   ============================================================ */

const COLORS = ["#e07400", "#1faa59", "#7c3aed", "#0ea5e9", "#e23d4e", "#f5a524", "#0d9488", "#db2777"];
function colorFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

const MAX_AVATAR_CHARS = 500_000; // ~360 KB decoded — a 512px JPEG data URL
const MAX_COVER_CHARS = 1_500_000; // ~1.1 MB decoded — a 1280px JPEG data URL

function validImage(url: string | null | undefined, cap: number): boolean {
  return url == null || (url.startsWith("data:image/") && url.length <= cap);
}

async function dbProfileDTO(userId: string): Promise<ProfileDTO | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: profiles.fullName,
      username: profiles.username,
      bio: profiles.bio,
      avatar: profiles.avatarUrl,
      cover: profiles.coverUrl,
      state: states.name,
      lga: lgas.name,
      ward: profiles.ward,
      pollingUnit: profiles.pollingUnit,
      createdAt: profiles.createdAt,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(states, eq(states.id, profiles.stateId))
    .leftJoin(lgas, eq(lgas.id, profiles.lgaId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName ?? row.email.split("@")[0],
    username: row.username ?? "",
    email: row.email,
    bio: row.bio ?? "",
    avatar: row.avatar,
    cover: row.cover,
    color: colorFor(row.id),
    state: row.state ?? "",
    lga: row.lga ?? "",
    ward: row.ward ?? "",
    pollingUnit: row.pollingUnit ?? "",
    memberSince: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

export async function getMyProfile(): Promise<ProfileDTO | null> {
  const u = await getCurrentUserSafe();
  if (!u) return null;
  if (usesDb(u.id)) return dbProfileDTO(u.id);
  mem.ensureMember(u.id, u.fullName ?? "Member");
  return mem.getProfileDTO(u.id);
}

export async function updateMyProfile(
  patch: ProfilePatch,
): Promise<{ ok: boolean; profile?: ProfileDTO; error?: string }> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "Sign in to edit your profile." };

  if (!usesDb(u.id)) {
    mem.ensureMember(u.id, u.fullName ?? "Member");
    const updated = mem.updateProfile(u.id, patch);
    if (!updated) return { ok: false, error: "Could not update profile." };
    return { ok: true, profile: mem.getProfileDTO(u.id)! };
  }

  /* ------------------------------ validate ------------------------------ */
  const fullName = patch.fullName?.trim().slice(0, 80);
  if (patch.fullName !== undefined && !fullName) {
    return { ok: false, error: "Your name can't be empty." };
  }
  let username: string | undefined;
  if (patch.username !== undefined) {
    username = patch.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30);
    if (username && username.length < 3) {
      return { ok: false, error: "Username needs at least 3 characters." };
    }
  }
  if (!validImage(patch.avatar, MAX_AVATAR_CHARS)) {
    return { ok: false, error: "That profile photo is too large — try a smaller image." };
  }
  if (!validImage(patch.cover, MAX_COVER_CHARS)) {
    return { ok: false, error: "That cover image is too large — try a smaller image." };
  }

  /* --------------------- resolve geo names → ids --------------------- */
  let stateId: string | null | undefined; // undefined = untouched
  let lgaId: string | null | undefined;
  if (patch.state !== undefined) {
    const stateName = (patch.state ?? "").trim();
    if (!stateName) {
      stateId = null;
      lgaId = null;
    } else {
      const [s] = await db
        .select({ id: states.id })
        .from(states)
        .where(sql`lower(${states.name}) = ${stateName.toLowerCase()}`)
        .limit(1);
      if (!s) return { ok: false, error: `"${stateName}" isn't a recognised state.` };
      stateId = s.id;
    }
  }
  if (patch.lga !== undefined && lgaId !== null) {
    const lgaName = (patch.lga ?? "").trim();
    if (!lgaName) {
      lgaId = null;
    } else {
      // Resolve within the (possibly just-changed) state.
      const targetStateId =
        stateId ??
        (
          await db
            .select({ id: profiles.stateId })
            .from(profiles)
            .where(eq(profiles.userId, u.id))
            .limit(1)
        )[0]?.id ??
        null;
      if (!targetStateId) return { ok: false, error: "Pick a state before choosing an LGA." };
      const [l] = await db
        .select({ id: lgas.id })
        .from(lgas)
        .where(and(eq(lgas.stateId, targetStateId), sql`lower(${lgas.name}) = ${lgaName.toLowerCase()}`))
        .limit(1);
      if (!l) return { ok: false, error: `"${lgaName}" isn't an LGA of that state.` };
      lgaId = l.id;
    }
  }

  /* ----------------------------- persist ----------------------------- */
  const [before] = await db
    .select({
      stateId: profiles.stateId,
      lgaId: profiles.lgaId,
      ward: profiles.ward,
      pollingUnit: profiles.pollingUnit,
    })
    .from(profiles)
    .where(eq(profiles.userId, u.id))
    .limit(1);
  if (!before) return { ok: false, error: "Profile not found." };

  if (username) {
    const [taken] = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(and(eq(profiles.username, username), ne(profiles.userId, u.id)))
      .limit(1);
    if (taken) return { ok: false, error: "That username is taken." };
  }

  const set: Partial<typeof profiles.$inferInsert> = {};
  if (fullName !== undefined) set.fullName = fullName;
  if (username !== undefined) set.username = username || null;
  if (patch.bio !== undefined) set.bio = (patch.bio ?? "").slice(0, 280);
  if (patch.avatar !== undefined) set.avatarUrl = patch.avatar;
  if (patch.cover !== undefined) set.coverUrl = patch.cover;
  if (stateId !== undefined) set.stateId = stateId;
  if (lgaId !== undefined) set.lgaId = lgaId;
  if (patch.ward !== undefined) set.ward = patch.ward?.trim().slice(0, 80) || null;
  if (patch.pollingUnit !== undefined) set.pollingUnit = patch.pollingUnit?.trim().slice(0, 80) || null;

  if (Object.keys(set).length > 0) {
    await db.update(profiles).set(set).where(eq(profiles.userId, u.id));
  }

  /* ------------- geo changed → re-place their communities ------------- */
  const geoChanged =
    (stateId !== undefined && stateId !== before.stateId) ||
    (lgaId !== undefined && lgaId !== before.lgaId) ||
    (set.ward !== undefined && set.ward !== before.ward) ||
    (set.pollingUnit !== undefined && set.pollingUnit !== before.pollingUnit);
  if (geoChanged) {
    try {
      await syncGeoCommunities(u.id);
    } catch (err) {
      // The save succeeded; community re-placement self-heals on next load.
      console.error("syncGeoCommunities failed:", err);
    }
  }

  return { ok: true, profile: (await dbProfileDTO(u.id))! };
}
