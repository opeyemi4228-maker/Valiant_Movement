"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import * as hdb from "@/lib/huddle-db";
import type { HuddlePeerDTO, HuddleSignalDTO } from "@/lib/huddle-db";

/* Community huddles — group voice/video calls over a pairwise WebRTC mesh. */

export async function startCommunityHuddle(
  communityId: string,
  mode: "voice" | "video",
): Promise<{ ok: boolean; huddleId?: string; mode?: string; meId?: string; startedBy?: string; error?: string }> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return { ok: false, error: "Huddles are for registered members." };
  const res = await hdb.startOrJoinHuddle(u.id, communityId, mode);
  return res.ok ? { ...res, meId: u.id } : res;
}

export async function getActiveHuddle(
  communityId: string,
): Promise<{ huddleId: string; mode: string; count: number } | null> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return null;
  try {
    return await hdb.activeHuddleFor(communityId);
  } catch {
    return null; // transient — the next poll recovers
  }
}

export async function pollCommunityHuddle(
  huddleId: string,
): Promise<{ ended: boolean; peers: HuddlePeerDTO[]; signals: HuddleSignalDTO[] }> {
  const u = await getCurrentUserSafe();
  // A momentary failure to read the session is NOT the huddle ending — saying
  // "ended" here tore live calls down out of nowhere. Only a genuinely absent
  // /finished huddle (decided in pollHuddle) ends the room.
  if (!u || !usesDb(u.id)) return { ended: false, peers: [], signals: [] };
  try {
    return await hdb.pollHuddle(u.id, huddleId);
  } catch {
    return { ended: false, peers: [], signals: [] }; // keep the room up on a blip
  }
}

export async function leaveCommunityHuddle(huddleId: string): Promise<void> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return;
  await hdb.leaveHuddle(u.id, huddleId).catch(() => {});
}

/** Host-only: end the huddle for every participant, not just the caller. */
export async function endCommunityHuddle(huddleId: string): Promise<{ ok: boolean; error?: string }> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return { ok: false, error: "Sign in as a registered member." };
  try {
    return await hdb.endHuddleForEveryone(u.id, huddleId);
  } catch (err) {
    console.error("endCommunityHuddle failed:", err);
    return { ok: false, error: "Couldn't end the huddle — please try again." };
  }
}

export async function sendHuddleSdp(
  huddleId: string,
  otherId: string,
  kind: "offer" | "answer",
  sdp: string,
): Promise<void> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return;
  await hdb.setHuddleSdp(u.id, huddleId, otherId, kind, sdp).catch(() => {});
}

export async function sendHuddleIce(huddleId: string, otherId: string, candidate: string): Promise<void> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return;
  await hdb.addHuddleIce(u.id, huddleId, otherId, candidate).catch(() => {});
}
