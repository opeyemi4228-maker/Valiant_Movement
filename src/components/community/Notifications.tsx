"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Heart,
  Repeat2,
  UserPlus,
  MessageCircle,
  AtSign,
  Users,
  Bookmark,
  Phone,
  BadgeCheck,
  CheckCheck,
  MessageSquareText,
  Newspaper,
  Wallet,
  CalendarClock,
} from "lucide-react";
import { getNotifications, markNotificationsRead } from "@/app/actions/notifications";
import type { NotificationDTO, NotifType } from "@/lib/notif-types";
import { PageHeader } from "./PageHeader";
import { ValiantEmpty, ValiantLoader } from "@/components/ui/valiant";

const META: Record<NotifType, { icon: typeof Heart; color: string }> = {
  like: { icon: Heart, color: "var(--color-brand-strong)" }, // "Support" — matches the feed
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

/** "Just now" · "5m ago" · "3d ago" · "05 Aug" (no "ago" on a date). */
function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "Just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 604800) return Math.floor(s / 86400) + "d ago";
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
    const poll = setInterval(load, 5000); // pulled back — reduce database data-transfer load
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
      <div className="pb-fab h-full overflow-y-auto">
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
    <div className="pb-fab h-full overflow-y-auto">
      <Header title={title} unreadCount={unreadCount} onMarkAll={markAll} />

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 py-3">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === "unread" ? unreadCount : 0;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[14px] font-semibold transition ${
                active
                  ? "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
                  : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List / empty / loading */}
      {!loaded ? (
        <ValiantLoader className="py-24" />
      ) : groups.length === 0 ? (
        <ValiantEmpty
          className="py-24"
          title="You're all caught up"
          text={filter === "unread" ? "No unread notifications." : "Support, comments, calls and dues reminders will show up here."}
          motto
        />
      ) : (
        groups.map((section) => (
          <section key={section.key}>
            <h2 className="px-4 pb-1 pt-4 text-[15px] font-bold text-[var(--color-ink)]">
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
    <PageHeader
      title={title}
      subtitle={bookmarks ? "Posts you saved to return to" : "What the movement did for you"}
      count={unreadCount}
      trailing={
        <div className="flex items-center gap-1">
          {!bookmarks && unreadCount > 0 && (
            <button
              onClick={onMarkAll}
              className="flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
      }
    />
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
      className={`flex items-start gap-3 px-4 py-3 transition hover:bg-[var(--color-surface-2)] ${
        !n.read ? "bg-[var(--color-brand-tint)]/35" : ""
      }`}
    >
      {/* avatar (actor initials) with a type badge */}
      <div className="relative shrink-0">
        <span
          className="grid size-11 place-items-center rounded-full text-[14px] font-bold text-white"
          style={{ backgroundColor: meta.color }}
        >
          {n.actorName ? initials(n.actorName) : <Icon className="h-5 w-5" />}
        </span>
        <span
          className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full ring-2 ring-white"
          style={{ background: meta.color }}
        >
          <Icon className={`h-3 w-3 text-white ${n.type === "like" ? "fill-current" : ""}`} />
        </span>
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`text-[14.5px] leading-snug ${n.read ? "text-[var(--color-ink-soft)]" : "font-medium text-[var(--color-ink)]"}`}>
          {n.body}
        </p>
        <span className="mt-1 block text-[12.5px] text-[var(--color-faint)]">{timeAgo(n.at)}</span>
      </div>
      {!n.read && <span aria-label="Unread" className="mt-2 size-2.5 shrink-0 rounded-full bg-[var(--color-brand)]" />}
    </div>
  );
}
