"use server";

import { getCurrentUser } from "@/lib/session";
import { usesDb } from "@/lib/env";
import * as mem from "@/lib/demo-store";
import * as cdb from "@/lib/call-db";
import { notify } from "@/lib/notify";
import type { CallSignal, CallMode } from "@/lib/call-types";

/* ============================================================
   Real-time presence & call signaling.

   Backed by Postgres when DATABASE_URL is set (works across
   serverless instances on Vercel), and by the in-memory demo
   store otherwise. Routing is per-id via usesDb(): a member
   signed in through the demo backend (slug ids like "m_amara")
   stays on the demo store even when a DB is configured — demo
   ids must never reach uuid columns. Call-scoped actions route
   by the call id ("call_xxx" = demo, UUID = Postgres).
   ============================================================ */

async function me(): Promise<string | null> {
  const u = await getCurrentUser();
  return u?.id ?? null;
}

export async function startCall(calleeId: string, mode: CallMode): Promise<{ ok: boolean; call?: CallSignal; error?: string }> {
  const id = await me();
  if (!id) return { ok: false, error: "Sign in to call." };
  if (calleeId === id) return { ok: false, error: "You can't call yourself." };

  const elig = usesDb(id) ? await cdb.callEligibility(id, calleeId) : mem.callEligibility(id, calleeId);
  if (!elig.ok) {
    return {
      ok: false,
      error: `You can call once you've each sent at least ${elig.need} messages. Keep chatting first.`,
    };
  }

  const call = usesDb(id) ? await cdb.placeCall(id, calleeId, mode) : mem.placeCall(id, calleeId, mode);
  await notify(calleeId, {
    type: "call",
    actorId: id,
    actorName: call.callerName,
    body: `${call.callerName} ${mode === "video" ? "video-" : ""}called you`,
    href: "messages",
  });
  return { ok: true, call };
}

export async function callEligibility(otherUserId: string): Promise<mem.CallEligibility> {
  const id = await me();
  if (!id) return { ok: false, sentByMe: 0, sentByOther: 0, need: mem.CALL_MIN_EACH };
  return usesDb(id) ? cdb.callEligibility(id, otherUserId) : mem.callEligibility(id, otherUserId);
}

export async function getModerationAlerts(): Promise<mem.ModerationAlert[]> {
  const id = await me();
  if (!id) return [];
  return mem.listModerationAlerts();
}

export async function getCallStatus(callId: string): Promise<CallSignal | null> {
  return usesDb(callId) ? cdb.getCallSignal(callId) : mem.getCallSignal(callId);
}

export async function answerCall(callId: string): Promise<CallSignal | null> {
  const id = await me();
  if (!id) return null;
  return usesDb(callId) ? cdb.answerCallSignal(callId, id) : mem.answerCallSignal(callId, id);
}

export async function declineCall(callId: string): Promise<CallSignal | null> {
  const id = await me();
  if (!id) return null;
  return usesDb(callId) ? cdb.declineCallSignal(callId, id) : mem.declineCallSignal(callId, id);
}

export async function hangupCall(callId: string): Promise<void> {
  if (usesDb(callId)) {
    await cdb.endCallSignal(callId);
  } else {
    mem.endCallSignal(callId);
    mem.rtcClear(callId);
  }
}

/* ------------------------- WebRTC signaling ------------------------- */

export async function sendOffer(callId: string, sdp: string): Promise<void> {
  if (usesDb(callId)) await cdb.rtcSetOffer(callId, sdp);
  else mem.rtcSetOffer(callId, sdp);
}

export async function sendAnswer(callId: string, sdp: string): Promise<void> {
  if (usesDb(callId)) await cdb.rtcSetAnswer(callId, sdp);
  else mem.rtcSetAnswer(callId, sdp);
}

export async function sendIce(callId: string, from: "caller" | "callee", candidate: string): Promise<void> {
  if (usesDb(callId)) await cdb.rtcAddIce(callId, from, candidate);
  else mem.rtcAddIce(callId, from, candidate);
}

export async function getSignal(callId: string): Promise<{
  offer?: string;
  answer?: string;
  iceFromCaller: string[];
  iceFromCallee: string[];
}> {
  return usesDb(callId) ? cdb.rtcGet(callId) : mem.rtcGet(callId);
}

export async function pollPresence(): Promise<{ incomingCall: CallSignal | null; unread: number }> {
  // This is a high-frequency background heartbeat: a transient failure (Neon
  // cold start, network blip) must degrade to "nothing new" — the next poll
  // recovers — rather than surface an error to the page.
  try {
    const id = await me();
    if (!id) return { incomingCall: null, unread: 0 };
    if (usesDb(id)) {
      const [incomingCall, unread] = await Promise.all([cdb.incomingCallFor(id), cdb.unreadFor(id)]);
      return { incomingCall, unread };
    }
    return { incomingCall: mem.incomingCallFor(id), unread: mem.unreadFor(id) };
  } catch (err) {
    console.error("pollPresence failed (returning empty):", err);
    return { incomingCall: null, unread: 0 };
  }
}
