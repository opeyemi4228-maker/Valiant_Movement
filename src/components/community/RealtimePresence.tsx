"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Bell } from "lucide-react";
import { pollPresence } from "@/app/actions/realtime";
import { getNotifications } from "@/app/actions/notifications";
import { playDing } from "@/lib/sound";

/** Mounted once in the member shell. Owns the ONE presence poll for the
 *  whole app — the new-message ding + toast, the notification-center bell
 *  badge/toast, AND the incoming-call signal (broadcast via the
 *  "valiant:incoming-call" window event for CallCenter to react to). This
 *  used to be two independent 2s pollers hitting the same presence query;
 *  consolidating halves that traffic. Calls (ring, accept, decline, in-call)
 *  are still driven solely by CallCenter — a second answer path here once
 *  opened rooms with no WebRTC wiring. */
export function RealtimePresence() {
  const [toast, setToast] = useState<string | null>(null);
  const [notifToast, setNotifToast] = useState<string | null>(null);

  const prevUnread = useRef<number>(-1);
  const prevNotifCount = useRef<number>(-1);
  const prevNotifTop = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let inFlight = false; // skip a tick rather than let slow polls pile up
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        // Independent reads — run together instead of one after the other,
        // and let either fail without losing the other's result.
        const [presenceRes, notifRes] = await Promise.allSettled([pollPresence(), getNotifications()]);
        if (!alive) return;

        if (presenceRes.status === "fulfilled") {
          const { unread, incomingCall } = presenceRes.value;
          if (prevUnread.current >= 0 && unread > prevUnread.current) {
            playDing();
            setToast("New message");
            setTimeout(() => setToast((t) => (t === "New message" ? null : t)), 3500);
          }
          prevUnread.current = unread;
          // CallCenter listens for this instead of running its own poll —
          // one presence query serves both surfaces.
          window.dispatchEvent(new CustomEvent("valiant:incoming-call", { detail: incomingCall }));
        }

        if (notifRes.status === "fulfilled") {
          const notif = notifRes.value;
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
        }
      } finally {
        inFlight = false;
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <>
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
