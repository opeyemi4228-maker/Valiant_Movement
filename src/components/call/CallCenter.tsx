"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startCall,
  getCallStatus,
  answerCall,
  declineCall,
  hangupCall,
} from "@/app/actions/realtime";
import type { CallSignal, CallMode } from "@/lib/call-types";
import { IncomingCall } from "./IncomingCall";
import { OutgoingCall } from "./OutgoingCall";
import { CallRoom, type CallConfig } from "./CallRoom";

/** Detail for the `valiant-call:start` window event that any screen (e.g. the
 *  chat header) dispatches to place a call through the global call center. */
export interface StartCallDetail {
  calleeId: string;
  name: string;
  color: string;
  mode: CallMode;
}

interface Outgoing {
  callId: string;
  name: string;
  color: string;
  mode: CallMode;
}

/**
 * App-wide call orchestrator. Rings the callee, waits for them to accept before
 * the room opens, surfaces incoming calls anywhere, and dings on new messages.
 * Mount once, high in the tree (MemberShell).
 */
export function CallCenter() {
  const [incoming, setIncoming] = useState<CallSignal | null>(null);
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null);
  const [outStatus, setOutStatus] = useState<string | undefined>(undefined);
  const [inCall, setInCall] = useState<{ callId: string; config: CallConfig; remoteEnded?: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Latest state for the presence loop without re-arming its interval.
  const busyRef = useRef(false);
  const startingRef = useRef(false); // synchronous latch: a call is being placed
  const incomingIdRef = useRef<string | null>(null);
  const handledRef = useRef<Set<string>>(new Set()); // calls already accepted/declined
  useEffect(() => {
    busyRef.current = !!(incoming || outgoing || inCall);
    incomingIdRef.current = incoming?.id ?? null;
  }, [incoming, outgoing, inCall]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  /* -------- presence: incoming calls --------
     RealtimePresence owns the actual poll (one presence query serves both
     surfaces instead of two independent 2s pollers) and broadcasts each
     result here as a window event. */
  useEffect(() => {
    const onPresence = (e: Event) => {
      const incomingCall = (e as CustomEvent<CallSignal | null>).detail;
      // Don't interrupt an active/ringing call with a new incoming banner,
      // and never re-show a call the user already accepted or declined.
      if (!busyRef.current || incomingIdRef.current) {
        if (incomingCall && incomingCall.status === "ringing" && !handledRef.current.has(incomingCall.id)) {
          if (incomingIdRef.current !== incomingCall.id && !inCall && !outgoing) {
            setIncoming(incomingCall);
          }
        } else if (incomingIdRef.current && (!incomingCall || incomingCall.status !== "ringing")) {
          setIncoming(null); // caller cancelled / it expired
        }
      }
    };
    window.addEventListener("valiant:incoming-call", onPresence);
    return () => window.removeEventListener("valiant:incoming-call", onPresence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- place a call (from the chat header, via window event) -------- */
  useEffect(() => {
    const onStart = async (e: Event) => {
      const d = (e as CustomEvent<StartCallDetail>).detail;
      // Latch synchronously so 20 rapid clicks place exactly ONE call — busyRef
      // only flips after the round-trip, which is too late to dedupe.
      if (busyRef.current || startingRef.current) return;
      startingRef.current = true;
      try {
        const res = await startCall(d.calleeId, d.mode);
        if (!res.ok || !res.call) {
          flash(res.error ?? "Couldn't start the call.");
          return;
        }
        setOutStatus(undefined);
        setOutgoing({ callId: res.call.id, name: d.name, color: d.color, mode: d.mode });
      } finally {
        startingRef.current = false;
      }
    };
    window.addEventListener("valiant-call:start", onStart);
    return () => window.removeEventListener("valiant-call:start", onStart);
  }, [flash]);

  /* -------- outgoing: wait for the callee to pick up -------- */
  useEffect(() => {
    if (!outgoing) return;
    let alive = true;
    let inFlight = false;
    const t = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      let sig: CallSignal | null;
      try {
        sig = await getCallStatus(outgoing.callId);
      } catch {
        return; // transient — keep ringing, next poll recovers
      } finally {
        inFlight = false;
      }
      if (!alive || !sig) return;
      if (sig.status === "accepted") {
        clearInterval(t);
        setOutgoing(null);
        setInCall({
          callId: sig.id,
          config: {
            mode: sig.mode,
            kind: "call",
            title: outgoing.name,
            subtitle: "Verified member",
            participants: [{ name: outgoing.name, color: outgoing.color }],
            callId: sig.id,
            role: "caller",
          },
        });
      } else if (sig.status === "declined" || sig.status === "missed" || sig.status === "ended") {
        clearInterval(t);
        setOutStatus(sig.status === "declined" ? "Call declined" : sig.status === "missed" ? "No answer" : "Call ended");
        setTimeout(() => { if (alive) { setOutgoing(null); setOutStatus(undefined); } }, 1800);
      }
    }, 600); // poll pickup quickly so the caller enters the room right after accept
    return () => { alive = false; clearInterval(t); };
  }, [outgoing]);

  /* -------- in-call: drop on both sides when either hangs up -------- */
  useEffect(() => {
    if (!inCall) return;
    let alive = true;
    let misses = 0;
    let inFlight = false;
    const t = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      let sig: CallSignal | null;
      try {
        sig = await getCallStatus(inCall.callId);
      } catch {
        return; // network blip — keep the call up
      } finally {
        inFlight = false;
      }
      if (!alive) return;
      if (sig && (sig.status === "ended" || sig.status === "declined" || sig.status === "missed")) {
        clearInterval(t);
        // The other party hung up — the room winds itself down and shows the
        // "X ended the call" summary instead of vanishing abruptly.
        setInCall((c) => (c ? { ...c, remoteEnded: true } : null));
        return;
      }
      // A missing signal is usually transient (serverless lag / brief store
      // miss). Only give up after several consecutive misses (~9s) so a live
      // call is never cut short by a single failed poll.
      if (!sig) {
        if (++misses >= 6) {
          clearInterval(t);
          setInCall((c) => (c ? { ...c, remoteEnded: true } : null));
        }
      } else {
        misses = 0;
      }
    }, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [inCall]);

  /* -------- actions --------
     Each button updates the UI IMMEDIATELY (optimistic), then tells the
     server. Never await before dismissing — a slow/failed round-trip must
     not leave the ring/accept/cancel button feeling dead. */
  function acceptIncoming() {
    const call = incoming;
    if (!call) return;
    handledRef.current.add(call.id);
    setIncoming(null);
    setInCall({
      callId: call.id,
      config: {
        mode: call.mode,
        kind: "call",
        title: call.callerName,
        subtitle: "Verified member",
        participants: [{ name: call.callerName, color: call.callerColor }],
        callId: call.id,
        role: "callee",
      },
    });
    answerCall(call.id).catch(() => flash("Couldn't connect — try again."));
  }

  function declineIncoming() {
    const call = incoming;
    if (!call) return;
    handledRef.current.add(call.id);
    setIncoming(null);
    declineCall(call.id).catch(() => {});
  }

  function cancelOutgoing() {
    const out = outgoing;
    setOutgoing(null);
    setOutStatus(undefined);
    if (out) hangupCall(out.callId).catch(() => {});
  }

  function endInCall() {
    const c = inCall;
    setInCall(null);
    if (c) hangupCall(c.callId).catch(() => {});
  }

  return (
    <>
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[90] flex justify-center px-4">
          <div className="rounded-full bg-[var(--color-navy)] px-4 py-2 text-sm font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
      {incoming && !inCall && (
        <IncomingCall call={incoming} onAccept={acceptIncoming} onDecline={declineIncoming} />
      )}
      {outgoing && !inCall && (
        <OutgoingCall
          name={outgoing.name}
          color={outgoing.color}
          mode={outgoing.mode}
          statusText={outStatus}
          onCancel={cancelOutgoing}
        />
      )}
      {inCall && <CallRoom config={inCall.config} onClose={endInCall} remoteEnded={inCall.remoteEnded} />}
    </>
  );
}
