"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Bell } from "lucide-react";
import { pollPresence } from "@/app/actions/realtime";
import { getNotifications } from "@/app/actions/notifications";
import { playDing } from "@/lib/sound";

/** Mounted once in the member shell. Owns the NOTIFICATION surfaces: the
 *  new-message ding + toast and the notification-center bell badge/toast.
 *  Calls (ring, accept, decline, in-call) are owned solely by CallCenter —
 *  a second answer path here once opened rooms with no WebRTC wiring. */
export function RealtimePresence() {
  const [toast, setToast] = useState<string | null>(null);
  const [notifToast, setNotifToast] = useState<string | null>(null);

  const prevUnread = useRef<number>(-1);
  const prevNotifCount = useRef<number>(-1);
  const prevNotifTop = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      let unread: number;
      try {
        ({ unread } = await pollPresence());
      } catch {
        return; // transient — the next tick recovers
      }
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
      let notif;
      try {
        notif = await getNotifications();
      } catch {
        return; // transient — the next tick recovers
      }
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
