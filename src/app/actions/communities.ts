"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import {
  ensureGeoCommunities,
  memberGeo,
  myCommunities,
  communityMemberList,
  openCommunityChatFor,
  type CommunityChatHandle,
  type CommunityDTO,
  type CommunityMemberDTO,
} from "@/lib/communities";

/* Geo communities for the signed-in member (State › LGA › Ward › Polling Unit). */

export interface MyCommunitiesResult {
  available: boolean;
  items: CommunityDTO[];
  placement: { state: string | null; lga: string | null; ward: string | null; pollingUnit: string | null } | null;
  reason?: string;
}

export async function getMyCommunities(): Promise<MyCommunitiesResult> {
  const u = await getCurrentUserSafe();
  if (!u) return { available: false, items: [], placement: null, reason: "Sign in to see your communities." };
  if (!usesDb(u.id)) {
    return {
      available: false,
      items: [],
      placement: null,
      reason: "Communities are for registered members — the demo backend has no geo placement.",
    };
  }

  const geo = await memberGeo(u.id);
  if (!geo || !geo.stateName) {
    return {
      available: false,
      items: [],
      placement: null,
      reason: "Your registration has no State/LGA/Ward yet, so we can't place you in a community.",
    };
  }

  // Self-heal: places this member (idempotent) so accounts created before
  // communities existed still land in the right groups.
  await ensureGeoCommunities(u.id, geo);

  return {
    available: true,
    items: await myCommunities(u.id),
    placement: {
      state: geo.stateName,
      lga: geo.lgaName,
      ward: geo.ward,
      pollingUnit: geo.pollingUnit,
    },
  };
}

export async function getCommunityMembers(communityId: string): Promise<CommunityMemberDTO[]> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return [];
  return communityMemberList(communityId);
}

/** Open (lazily creating) the community's WhatsApp-style group chat and seat
 *  the signed-in member in it. Messages then flow through the normal chat
 *  actions (getMessages / sendMessage) with the returned conversation id. */
export async function openCommunityChat(
  communityId: string,
): Promise<{ ok: boolean; chat?: CommunityChatHandle; error?: string }> {
  const u = await getCurrentUserSafe();
  if (!u) return { ok: false, error: "Sign in to join the conversation." };
  if (!usesDb(u.id)) {
    return { ok: false, error: "Community chat is for registered members — the demo account has no community placement." };
  }
  return openCommunityChatFor(u.id, communityId);
}
