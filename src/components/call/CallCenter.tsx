"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startCall,
  getCallStatus,
  answerCall,
  declineCall,
  hangupCall,
  pollPresence,
} from "@/app/actions/realtime";
import type { CallSignal, CallMode } from "@/lib/call-types";
import { playDing } from "@/lib/sound";
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
  const [inCall, setInCall] = useState<{ callId: string; config: CallConfig } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Latest state for the presence loop without re-arming its interval.
  const busyRef = useRef(false);
  const incomingIdRef = useRef<string | null>(null);
  useEffect(() => {
    busyRef.current = !!(incoming || outgoing || inCall);
    incomingIdRef.current = incoming?.id ?? null;
  }, [incoming, outgoing, inCall]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  /* -------- presence: incoming calls + new-message ding -------- */
  useEffect(() => {
    let alive = true;
    let prevUnread = -1; // -1 → skip the ding on the very first sample
    const tick = async () => {
      const { incomingCall, unread } = await pollPresence();
      if (!alive) return;

      if (prevUnread >= 0 && unread > prevUnread) playDing();
      prevUnread = unread;

      // Don't interrupt an active/ringing call with a new incoming banner.
      if (!busyRef.current || incomingIdRef.current) {
        if (incomingCall && incomingCall.status === "ringing") {
          if (incomingIdRef.current !== incomingCall.id && !inCall && !outgoing) {
            setIncoming(incomingCall);
          }
        } else if (incomingIdRef.current) {
          setIncoming(null); // caller cancelled / it expired
        }
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- place a call (from the chat header, via window event) -------- */
  useEffect(() => {
    const onStart = async (e: Event) => {
      const d = (e as CustomEvent<StartCallDetail>).detail;
      if (busyRef.current) return;
      const res = await startCall(d.calleeId, d.mode);
      if (!res.ok || !res.call) {
        flash(res.error ?? "Couldn't start the call.");
        return;
      }
      setOutStatus(undefined);
      setOutgoing({ callId: res.call.id, name: d.name, color: d.color, mode: d.mode });
    };
    window.addEventListener("valiant-call:start", onStart);
    return () => window.removeEventListener("valiant-call:start", onStart);
  }, [flash]);

  /* -------- outgoing: wait for the callee to pick up -------- */
  useEffect(() => {
    if (!outgoing) return;
    let alive = true;
    const t = setInterval(async () => {
      const sig = await getCallStatus(outgoing.callId);
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
    }, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [outgoing]);

  /* -------- in-call: drop on both sides when either hangs up -------- */
  useEffect(() => {
    if (!inCall) return;
    let alive = true;
    let misses = 0;
    const t = setInterval(async () => {
      let sig: CallSignal | null;
      try {
        sig = await getCallStatus(inCall.callId);
      } catch {
        return; // network blip — keep the call up
      }
      if (!alive) return;
      if (sig && (sig.status === "ended" || sig.status === "declined" || sig.status === "missed")) {
        clearInterval(t);
        setInCall(null); // the other party hung up — close automatically
        return;
      }
      // A missing signal is usually transient (serverless lag / brief store
      // miss). Only give up after several consecutive misses (~9s) so a live
      // call is never cut short by a single failed poll.
      if (!sig) {
        if (++misses >= 6) { clearInterval(t); setInCall(null); }
      } else {
        misses = 0;
      }
    }, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [inCall]);

  /* -------- actions -------- */
  async function acceptIncoming() {
    if (!incoming) return;
    const sig = await answerCall(incoming.id);
    setIncoming(null);
    if (sig) {
      setInCall({
        callId: sig.id,
        config: {
          mode: sig.mode,
          kind: "call",
          title: sig.callerName,
          subtitle: "Verified member",
          participants: [{ name: sig.callerName, color: sig.callerColor }],
          callId: sig.id,
          role: "callee",
        },
      });
    }
  }

  async function declineIncoming() {
    if (!incoming) return;
    await declineCall(incoming.id);
    setIncoming(null);
  }

  async function cancelOutgoing() {
    if (outgoing) await hangupCall(outgoing.callId);
    setOutgoing(null);
    setOutStatus(undefined);
  }

  async function endInCall() {
    if (inCall) await hangupCall(inCall.callId);
    setInCall(null);
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
      {inCall && <CallRoom config={inCall.config} onClose={endInCall} />}
    </>
  );
}
