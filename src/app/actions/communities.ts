"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import {
  ensureGeoCommunities,
  memberGeo,
  myCommunities,
  communityMemberList,
  openCommunityChatFor,
  unreadByCommunityFor,
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
  /** Set only when every retry was exhausted — distinct from "not placed in
   *  a community yet", so the client knows to retry rather than show the
   *  "no placement" message. */
  error?: boolean;
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

  // Never allowed to throw: a rejected promise here previously left the
  // client's un-caught `.then()` stuck on its loading spinner forever with
  // no recovery (the same class of bug that hit Messages — see chat.ts's
  // loadChat). Retried as one unit against a transient Neon hiccup/cold
  // start; if every attempt still fails, `error: true` tells the client to
  // retry itself rather than show a wrong "not placed" message.
  try {
    const geo = await withRetry(() => memberGeo(u.id));
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
    await withRetry(() => ensureGeoCommunities(u.id, geo));

    return {
      available: true,
      items: await withRetry(() => myCommunities(u.id)),
      placement: {
        state: geo.stateName,
        lga: geo.lgaName,
        ward: geo.ward,
        pollingUnit: geo.pollingUnit,
      },
    };
  } catch (err) {
    console.error("getMyCommunities failed (returning empty so the client can retry):", err);
    return { available: true, items: [], placement: null, error: true };
  }
}

export async function getCommunityMembers(communityId: string): Promise<CommunityMemberDTO[]> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return [];
  return communityMemberList(communityId);
}

/** Polled by the Communities list — per-community unread counts for the
 *  row-level badge. Returns `null` on a transient failure (retries
 *  exhausted) so the client keeps its last-known badges instead of
 *  wiping them to zero; the next poll tick recovers. */
export async function getCommunitiesUnread(): Promise<Record<string, number> | null> {
  const u = await getCurrentUserSafe();
  if (!u || !usesDb(u.id)) return {};
  try {
    return await withRetry(() => unreadByCommunityFor(u.id));
  } catch (err) {
    console.error("getCommunitiesUnread failed (returning null so the client keeps its last-known state):", err);
    return null;
  }
}

/** Open (lazily creating) the community's WhatsApp-style group chat and seat
 *  the signed-in member in it. Messages then flow through the normal chat
 *  actions (getMessages / sendMessage) with the returned conversation id. */
export async function openCommunityChat(
  communityId: string,
): Promise<{ ok: boolean; chat?: CommunityChatHandle; error?: string; transient?: boolean }> {
  const u = await getCurrentUserSafe();
  if (!u) return { ok: false, error: "Sign in to join the conversation." };
  if (!usesDb(u.id)) {
    return { ok: false, error: "Community chat is for registered members — the demo account has no community placement." };
  }
  return openCommunityChatFor(u.id, communityId);
}
