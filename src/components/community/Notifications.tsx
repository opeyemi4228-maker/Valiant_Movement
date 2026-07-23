"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Heart,
  Repeat2,
  UserPlus,
  MessageCircle,
  AtSign,
  Users,
  Bell,
  Bookmark,
  Phone,
  BadgeCheck,
  CheckCheck,
  Settings,
  MessageSquareText,
  Newspaper,
  Wallet,
  CalendarClock,
} from "lucide-react";
import { getNotifications, markNotificationsRead } from "@/app/actions/notifications";
import type { NotificationDTO, NotifType } from "@/lib/notif-types";

const META: Record<NotifType, { icon: typeof Heart; color: string }> = {
  like: { icon: Heart, color: "var(--color-danger)" },
  comment: { icon: MessageCircle, color: "#0ea5e9" },
  repost: { icon: Repeat2, color: "var(--color-green)" },
  follow: { icon: UserPlus, color: "var(--color-brand)" },
  mention: { icon: AtSign, color: "#0ea5e9" },
  call: { icon: Phone, color: "var(--color-green)" },
  verified: { icon: BadgeCheck, color: "var(--color-brand)" },
  system: { icon: Users, color: "var(--color-brand)" },
  message: { icon: MessageSquareText, color: "var(--color-navy)" },
  post: { icon: Newspaper, color: "var(--color-brand-strong)" },
  finance: { icon: Wallet, color: "var(--color-green)" },
  dues: { icon: CalendarClock, color: "var(--color-amber)" },
};

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });
}

type Group = "today" | "week" | "earlier";
const GROUP_LABEL: Record<Group, string> = { today: "Today", week: "This week", earlier: "Earlier" };
function groupOf(iso: string): Group {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "today";
  return Date.now() - d.getTime() < 7 * 86400_000 ? "week" : "earlier";
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export function Notifications({
  title,
  bookmarks = false,
  active = true,
}: {
  title: string;
  bookmarks?: boolean;
  active?: boolean;
}) {
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    // Paused while another tab is active — this component stays mounted
    // (so switching back is instant) but its background poll stands down;
    // reactivating fires the load immediately below so the list is never stale.
    if (bookmarks || !active) return;
    let alive = true;
    let inFlight = false; // skip a tick rather than let slow polls pile up
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        // `null` means every server-side retry was exhausted — keep the
        // current list on screen instead of flashing it empty; the next
        // poll tick recovers.
        const res = await getNotifications();
        if (alive && res) { setItems(res.items); setLoaded(true); }
      } catch {
        /* transient — the next poll recovers */
      } finally {
        inFlight = false;
      }
    };
    load();
    // Opening the tab marks them read a moment later, so the nav badge clears
    // (the "new" highlight stays for this view until the next refresh).
    const mark = setTimeout(() => { markNotificationsRead().catch(() => {}); }, 1200);
    const poll = setInterval(load, 1500); // tightened — matches the rest of the app's real-time feel
    return () => { alive = false; clearTimeout(mark); clearInterval(poll); };
  }, [bookmarks, active]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const filtered = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.read) : items),
    [items, filter],
  );

  const groups = useMemo(() => {
    const g: Record<Group, NotificationDTO[]> = { today: [], week: [], earlier: [] };
    for (const n of filtered) g[groupOf(n.at)].push(n);
    return (["today", "week", "earlier"] as Group[])
      .map((key) => ({ key, items: g[key] }))
      .filter((s) => s.items.length > 0);
  }, [filtered]);

  function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    markNotificationsRead().catch(() => {});
  }

  /* ----------------------------- Bookmarks ----------------------------- */
  if (bookmarks) {
    return (
      <div className="h-full overflow-y-auto">
        <Header title={title} bookmarks />
        <div className="grid place-items-center px-6 py-24 text-center">
          <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-[var(--color-brand-tint)]">
            <Bookmark className="h-7 w-7 text-[var(--color-brand-strong)]" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-navy)]">Save posts for later</h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">
            Bookmark posts from the feed and they&apos;ll show up here — only you can see your bookmarks.
          </p>
        </div>
      </div>
    );
  }

  /* --------------------------- Notifications --------------------------- */
  return (
    <div className="h-full overflow-y-auto">
      <Header title={title} unreadCount={unreadCount} onMarkAll={markAll} />

      {/* Filter tabs */}
      <div className="sticky top-[57px] z-10 flex gap-1 border-b border-[var(--color-line)] bg-white/90 px-3 py-2 backdrop-blur">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === "unread" ? unreadCount : 0;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                active ? "bg-[var(--color-navy)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ${active ? "bg-white/25 text-white" : "bg-[var(--color-brand)] text-white"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List / empty / loading */}
      {!loaded ? (
        <div className="grid place-items-center py-24 text-sm text-[var(--color-faint)]">Loading notifications…</div>
      ) : groups.length === 0 ? (
        <div className="grid place-items-center px-6 py-24 text-center">
          <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-[var(--color-surface-2)]">
            <CheckCheck className="h-7 w-7 text-[var(--color-faint)]" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-navy)]">You&apos;re all caught up</h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">
            {filter === "unread" ? "No unread notifications." : "Likes, comments, calls and mentions will show up here."}
          </p>
        </div>
      ) : (
        groups.map((section) => (
          <section key={section.key}>
            <h2 className="bg-[var(--color-surface-2)]/60 px-5 py-2 text-xs font-bold uppercase tracking-wider text-[var(--color-faint)]">
              {GROUP_LABEL[section.key]}
            </h2>
            {section.items.map((n) => (
              <Row key={n.id} n={n} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/* -------------------------------- header -------------------------------- */

function Header({
  title,
  unreadCount = 0,
  onMarkAll,
  bookmarks = false,
}: {
  title: string;
  unreadCount?: number;
  onMarkAll?: () => void;
  bookmarks?: boolean;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--color-line)] bg-white/85 px-5 py-3.5 backdrop-blur">
      {bookmarks ? (
        <Bookmark className="h-5 w-5 text-[var(--color-brand-strong)]" />
      ) : (
        <Bell className="h-5 w-5 text-[var(--color-brand-strong)]" />
      )}
      <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">{title}</h1>
      {unreadCount > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
          {unreadCount}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {!bookmarks && unreadCount > 0 && (
          <button
            onClick={onMarkAll}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
        <button
          className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
          aria-label="Notification settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- row --------------------------------- */

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function Row({ n }: { n: NotificationDTO }) {
  const meta = META[n.type] ?? META.system;
  const Icon = meta.icon;
  return (
    <div
      className={`relative flex items-start gap-3 border-b border-[var(--color-line)] px-5 py-4 transition hover:bg-[var(--color-surface-2)] ${
        !n.read ? "bg-[var(--color-brand-tint)]/40" : ""
      }`}
    >
      {!n.read && <span className="absolute inset-y-0 left-0 w-[3px] bg-[var(--color-brand)]" />}

      {/* avatar (actor initials) with type badge */}
      <div className="relative shrink-0">
        <span
          className="grid size-[46px] place-items-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: meta.color }}
        >
          {n.actorName ? initials(n.actorName) : <Icon className="h-6 w-6" />}
        </span>
        <span
          className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full ring-2 ring-white"
          style={{ background: meta.color }}
        >
          <Icon className={`h-3 w-3 text-white ${n.type === "like" ? "fill-current" : ""}`} />
        </span>
      </div>

      {/* body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14px] leading-relaxed text-[var(--color-ink-soft)]">{n.body}</p>
          {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--color-brand)]" />}
        </div>
        <span className="mt-1 block text-xs text-[var(--color-faint)]">{timeAgo(n.at)} ago</span>
      </div>
    </div>
  );
}
