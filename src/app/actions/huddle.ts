"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import * as hdb from "@/lib/huddle-db";
import type { HuddlePeerDTO, HuddleSignalDTO } from "@/lib/huddle-db";

/* Community huddles — group voice/video calls over a pairwise WebRTC mesh. */

export async function startCommunityHuddle(
  communityId: string,
  mode: "voice" | "video",
): Promise<{ ok: boolean; huddleId?: string; mode?: string; meId?: string; error?: string }> {
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
  if (!u || !usesDb(u.id)) return { ended: true, peers: [], signals: [] };
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
