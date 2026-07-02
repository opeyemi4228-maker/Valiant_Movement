"use server";

import { getCurrentUser } from "@/lib/session";
import * as mem from "@/lib/demo-store";
import type { CallSignal, CallMode } from "@/lib/call-types";

/* ============================================================
   Real-time presence & call signaling over the in-memory store.
   Lets one member ring another (the callee gets an incoming-call
   screen) and surfaces unread counts for sound notifications.
   ============================================================ */

async function me(): Promise<string | null> {
  const u = await getCurrentUser();
  return u?.id ?? null;
}

export async function startCall(calleeId: string, mode: CallMode): Promise<{ ok: boolean; call?: CallSignal; error?: string }> {
  const id = await me();
  if (!id) return { ok: false, error: "Sign in to call." };
  if (calleeId === id) return { ok: false, error: "You can't call yourself." };
  const elig = mem.callEligibility(id, calleeId);
  if (!elig.ok) {
    return {
      ok: false,
      error: `You can call once you've each sent at least ${elig.need} messages. Keep chatting first.`,
    };
  }
  return { ok: true, call: mem.placeCall(id, calleeId, mode) };
}

export async function callEligibility(otherUserId: string): Promise<mem.CallEligibility> {
  const id = await me();
  if (!id) return { ok: false, sentByMe: 0, sentByOther: 0, need: mem.CALL_MIN_EACH };
  return mem.callEligibility(id, otherUserId);
}

export async function getModerationAlerts(): Promise<mem.ModerationAlert[]> {
  const id = await me();
  if (!id) return [];
  return mem.listModerationAlerts();
}

export async function getCallStatus(callId: string): Promise<CallSignal | null> {
  return mem.getCallSignal(callId);
}

export async function answerCall(callId: string): Promise<CallSignal | null> {
  const id = await me();
  if (!id) return null;
  return mem.answerCallSignal(callId, id);
}

export async function declineCall(callId: string): Promise<CallSignal | null> {
  const id = await me();
  if (!id) return null;
  return mem.declineCallSignal(callId, id);
}

export async function hangupCall(callId: string): Promise<void> {
  mem.endCallSignal(callId);
  mem.rtcClear(callId);
}

/* ------------------------- WebRTC signaling ------------------------- */

export async function sendOffer(callId: string, sdp: string): Promise<void> {
  mem.rtcSetOffer(callId, sdp);
}

export async function sendAnswer(callId: string, sdp: string): Promise<void> {
  mem.rtcSetAnswer(callId, sdp);
}

export async function sendIce(callId: string, from: "caller" | "callee", candidate: string): Promise<void> {
  mem.rtcAddIce(callId, from, candidate);
}

export async function getSignal(callId: string): Promise<{
  offer?: string;
  answer?: string;
  iceFromCaller: string[];
  iceFromCallee: string[];
}> {
  return mem.rtcGet(callId);
}

export async function pollPresence(): Promise<{ incomingCall: CallSignal | null; unread: number }> {
  const id = await me();
  if (!id) return { incomingCall: null, unread: 0 };
  return { incomingCall: mem.incomingCallFor(id), unread: mem.unreadFor(id) };
}
