"use server";

import { getCurrentUser } from "@/lib/session";
import { hasDb } from "@/lib/env";
import * as mem from "@/lib/demo-store";
import * as cdb from "@/lib/call-db";
import type { CallSignal, CallMode } from "@/lib/call-types";

/* ============================================================
   Real-time presence & call signaling.

   Backed by Postgres when DATABASE_URL is set (works across
   serverless instances on Vercel), and by the in-memory demo
   store otherwise. Lets one member ring another (the callee
   gets an incoming-call screen), relays WebRTC offer/answer/ICE,
   and surfaces unread counts for notification sounds.
   ============================================================ */

async function me(): Promise<string | null> {
  const u = await getCurrentUser();
  return u?.id ?? null;
}

export async function startCall(calleeId: string, mode: CallMode): Promise<{ ok: boolean; call?: CallSignal; error?: string }> {
  const id = await me();
  if (!id) return { ok: false, error: "Sign in to call." };
  if (calleeId === id) return { ok: false, error: "You can't call yourself." };

  const elig = hasDb() ? await cdb.callEligibility(id, calleeId) : mem.callEligibility(id, calleeId);
  if (!elig.ok) {
    return {
      ok: false,
      error: `You can call once you've each sent at least ${elig.need} messages. Keep chatting first.`,
    };
  }

  const call = hasDb() ? await cdb.placeCall(id, calleeId, mode) : mem.placeCall(id, calleeId, mode);
  return { ok: true, call };
}

export async function callEligibility(otherUserId: string): Promise<mem.CallEligibility> {
  const id = await me();
  if (!id) return { ok: false, sentByMe: 0, sentByOther: 0, need: mem.CALL_MIN_EACH };
  return hasDb() ? cdb.callEligibility(id, otherUserId) : mem.callEligibility(id, otherUserId);
}

export async function getModerationAlerts(): Promise<mem.ModerationAlert[]> {
  const id = await me();
  if (!id) return [];
  return mem.listModerationAlerts();
}

export async function getCallStatus(callId: string): Promise<CallSignal | null> {
  return hasDb() ? cdb.getCallSignal(callId) : mem.getCallSignal(callId);
}

export async function answerCall(callId: string): Promise<CallSignal | null> {
  const id = await me();
  if (!id) return null;
  return hasDb() ? cdb.answerCallSignal(callId, id) : mem.answerCallSignal(callId, id);
}

export async function declineCall(callId: string): Promise<CallSignal | null> {
  const id = await me();
  if (!id) return null;
  return hasDb() ? cdb.declineCallSignal(callId, id) : mem.declineCallSignal(callId, id);
}

export async function hangupCall(callId: string): Promise<void> {
  if (hasDb()) {
    await cdb.endCallSignal(callId);
  } else {
    mem.endCallSignal(callId);
    mem.rtcClear(callId);
  }
}

/* ------------------------- WebRTC signaling ------------------------- */

export async function sendOffer(callId: string, sdp: string): Promise<void> {
  if (hasDb()) await cdb.rtcSetOffer(callId, sdp);
  else mem.rtcSetOffer(callId, sdp);
}

export async function sendAnswer(callId: string, sdp: string): Promise<void> {
  if (hasDb()) await cdb.rtcSetAnswer(callId, sdp);
  else mem.rtcSetAnswer(callId, sdp);
}

export async function sendIce(callId: string, from: "caller" | "callee", candidate: string): Promise<void> {
  if (hasDb()) await cdb.rtcAddIce(callId, from, candidate);
  else mem.rtcAddIce(callId, from, candidate);
}

export async function getSignal(callId: string): Promise<{
  offer?: string;
  answer?: string;
  iceFromCaller: string[];
  iceFromCallee: string[];
}> {
  return hasDb() ? cdb.rtcGet(callId) : mem.rtcGet(callId);
}

export async function pollPresence(): Promise<{ incomingCall: CallSignal | null; unread: number }> {
  const id = await me();
  if (!id) return { incomingCall: null, unread: 0 };
  if (hasDb()) {
    const [incomingCall, unread] = await Promise.all([cdb.incomingCallFor(id), cdb.unreadFor(id)]);
    return { incomingCall, unread };
  }
  return { incomingCall: mem.incomingCallFor(id), unread: mem.unreadFor(id) };
}
