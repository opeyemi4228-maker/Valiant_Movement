"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Bell } from "lucide-react";
import { pollPresence, answerCall, declineCall, hangupCall } from "@/app/actions/realtime";
import { getNotifications } from "@/app/actions/notifications";
import { CallRoom, type CallConfig } from "@/components/call/CallRoom";
import { IncomingCall } from "@/components/call/IncomingCall";
import type { CallSignal } from "@/lib/call-types";
import { playDing } from "@/lib/sound";

/** Mounted once in the member shell. Polls for incoming calls (rings the
 *  callee) and new messages (plays a notification ding + toast). */
export function RealtimePresence() {
  const [incoming, setIncoming] = useState<CallSignal | null>(null);
  const [activeCall, setActiveCall] = useState<CallConfig | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notifToast, setNotifToast] = useState<string | null>(null);

  const prevUnread = useRef<number>(-1);
  const prevNotifCount = useRef<number>(-1);
  const prevNotifTop = useRef<string | null>(null);
  const acceptedId = useRef<string | null>(null);
  const incomingId = useRef<string | null>(null);
  const inCall = useRef(false);
  useEffect(() => {
    incomingId.current = incoming?.id ?? null;
    inCall.current = !!activeCall;
  }, [incoming, activeCall]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const { incomingCall, unread } = await pollPresence();
      if (!alive) return;

      // new-message notification
      if (prevUnread.current >= 0 && unread > prevUnread.current) {
        playDing();
        setToast("New message");
        setTimeout(() => setToast((t) => (t === "New message" ? null : t)), 3500);
      }
      prevUnread.current = unread;

      // notification center — alert on a genuinely new item, broadcast the
      // unread count so the nav bell badge stays live.
      const notif = await getNotifications();
      if (!alive) return;
      const top = notif.items[0] ?? null;
      if (
        prevNotifCount.current >= 0 &&
        top &&
        top.id !== prevNotifTop.current &&
        notif.unread > prevNotifCount.current
      ) {
        playDing();
        const body = top.body;
        setNotifToast(body);
        setTimeout(() => setNotifToast((t) => (t === body ? null : t)), 4500);
      }
      prevNotifCount.current = notif.unread;
      prevNotifTop.current = top?.id ?? null;
      window.dispatchEvent(new CustomEvent("valiant:notif-unread", { detail: notif.unread }));

      // incoming call ring (ignore while already in a call)
      if (inCall.current) return;
      if (incomingCall && incomingCall.id !== incomingId.current) {
        setIncoming(incomingCall);
      } else if (!incomingCall && incomingId.current) {
        setIncoming(null); // caller cancelled / timed out
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function accept() {
    if (!incoming) return;
    const call = incoming;
    setIncoming(null);
    await answerCall(call.id);
    acceptedId.current = call.id;
    setActiveCall({
      mode: call.mode,
      kind: "call",
      title: call.callerName,
      subtitle: "Verified member",
      participants: [{ name: call.callerName, color: call.callerColor }],
    });
  }

  async function decline() {
    if (!incoming) return;
    await declineCall(incoming.id);
    setIncoming(null);
  }

  function endActive() {
    if (acceptedId.current) hangupCall(acceptedId.current);
    acceptedId.current = null;
    setActiveCall(null);
  }

  return (
    <>
      {incoming && <IncomingCall call={incoming} onAccept={accept} onDecline={decline} />}
      {activeCall && <CallRoom config={activeCall} onClose={endActive} />}
      {toast && (
        <div className="fixed left-1/2 top-4 z-[75] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--color-navy)] px-4 py-2 text-sm font-semibold text-white shadow-xl">
          <MessageCircle className="h-4 w-4 text-[var(--color-brand)]" />
          {toast}
        </div>
      )}
      {notifToast && (
        <button
          onClick={() => { window.dispatchEvent(new Event("valiant:open-notifications")); setNotifToast(null); }}
          className="fixed left-1/2 top-4 z-[76] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)] shadow-xl ring-1 ring-[var(--color-line)]"
        >
          <Bell className="h-4 w-4 shrink-0 text-[var(--color-brand-strong)]" />
          <span className="truncate">{notifToast}</span>
        </button>
      )}
    </>
  );
}
