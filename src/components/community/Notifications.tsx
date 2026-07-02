"use client";

import { useMemo, useState } from "react";
import {
  Heart,
  Repeat2,
  UserPlus,
  MessageCircle,
  BadgeCheck,
  Users,
  Bookmark,
  Bell,
  AtSign,
  CalendarClock,
  Wallet,
  Trophy,
  CheckCheck,
  ChevronRight,
  Loader2,
  Settings,
} from "lucide-react";
import { people, type Person } from "@/data/community";
import { Avatar } from "./Avatar";

type NotifType =
  | "like"
  | "repost"
  | "follow"
  | "reply"
  | "mention"
  | "verified"
  | "community"
  | "event"
  | "donation"
  | "milestone";

type Group = "today" | "week" | "earlier";
type Action = "follow" | "join" | "rsvp" | "view";

interface Notif {
  id: string;
  type: NotifType;
  personId?: string;
  text: string;
  time: string;
  group: Group;
  unread?: boolean;
  preview?: string;
  action?: Action;
}

const NOTIFS: Notif[] = [
  { id: "n1", type: "like", personId: "p2", text: "and 1,283 others liked your post about the town hall", time: "8m", group: "today", unread: true },
  { id: "n2", type: "mention", personId: "p5", text: "mentioned you in a post", preview: "Massive turnout at the ward drive today — proud of @you and the whole team 🔥", time: "22m", group: "today", unread: true },
  { id: "n3", type: "follow", personId: "p7", text: "followed you", time: "31m", group: "today", unread: true, action: "follow" },
  { id: "n4", type: "repost", personId: "p4", text: "reposted your update on NIN verification", time: "1h", group: "today", unread: true },
  { id: "n5", type: "community", personId: "p1", text: "invited you to join", preview: "Enugu · Ward 4", time: "2h", group: "today", unread: true, action: "join" },
  { id: "n6", type: "event", personId: "p3", text: "National Executive Meeting starts in 1 hour", time: "3h", group: "today", action: "rsvp" },
  { id: "n7", type: "reply", personId: "p3", text: "replied to your post", preview: "This is exactly the leadership we need 🙌", time: "5h", group: "week" },
  { id: "n8", type: "donation", personId: "p2", text: "Your ₦5,000 contribution to “Support Our Brothers” was received", time: "1d", group: "week" },
  { id: "n9", type: "milestone", text: "You reached 1,000 followers — congratulations, valiant leader! 🎉", time: "2d", group: "week" },
  { id: "n10", type: "verified", personId: "p6", text: "Your NIN verification is being processed by the listener agent", time: "3d", group: "earlier" },
];

const META: Record<NotifType, { icon: typeof Heart; color: string }> = {
  like: { icon: Heart, color: "var(--color-danger)" },
  repost: { icon: Repeat2, color: "var(--color-green)" },
  follow: { icon: UserPlus, color: "var(--color-brand)" },
  reply: { icon: MessageCircle, color: "#0ea5e9" },
  mention: { icon: AtSign, color: "#0ea5e9" },
  verified: { icon: BadgeCheck, color: "var(--color-brand)" },
  community: { icon: Users, color: "#7c3aed" },
  event: { icon: CalendarClock, color: "var(--color-brand)" },
  donation: { icon: Wallet, color: "var(--color-green)" },
  milestone: { icon: Trophy, color: "var(--color-amber)" },
};

const GROUP_LABEL: Record<Group, string> = {
  today: "Today",
  week: "This week",
  earlier: "Earlier",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "mentions", label: "Mentions" },
  { key: "verification", label: "Verification" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export function Notifications({ title, bookmarks = false }: { title: string; bookmarks?: boolean }) {
  const byId = (id?: string): Person | undefined =>
    id ? people.find((p) => p.id === id) : undefined;

  const [filter, setFilter] = useState<FilterKey>("all");
  const [read, setRead] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [joined, setJoined] = useState<Set<string>>(new Set());

  const isUnread = (n: Notif) => !!n.unread && !read.has(n.id);

  const unreadCount = useMemo(
    () => NOTIFS.filter(isUnread).length,
    [read], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filtered = useMemo(() => {
    return NOTIFS.filter((n) => {
      if (filter === "unread") return isUnread(n);
      if (filter === "mentions") return n.type === "mention" || n.type === "reply";
      if (filter === "verification") return n.type === "verified";
      return true;
    });
  }, [filter, read]); // eslint-disable-line react-hooks/exhaustive-deps

  // group the filtered list, preserving order
  const groups = useMemo(() => {
    const g: Record<Group, Notif[]> = { today: [], week: [], earlier: [] };
    for (const n of filtered) g[n.group].push(n);
    return (["today", "week", "earlier"] as Group[])
      .map((key) => ({ key, items: g[key] }))
      .filter((s) => s.items.length > 0);
  }, [filtered]);

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
      <Header
        title={title}
        unreadCount={unreadCount}
        onMarkAll={() => setRead(new Set(NOTIFS.map((n) => n.id)))}
      />

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
                active
                  ? "bg-[var(--color-navy)] text-white"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {f.label}
              {count > 0 && (
                <span
                  className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ${
                    active ? "bg-white/25 text-white" : "bg-[var(--color-brand)] text-white"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {groups.length === 0 ? (
        <div className="grid place-items-center px-6 py-24 text-center">
          <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-[var(--color-surface-2)]">
            <CheckCheck className="h-7 w-7 text-[var(--color-faint)]" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-navy)]">You&apos;re all caught up</h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">
            Nothing to show in this view right now.
          </p>
        </div>
      ) : (
        groups.map((section) => (
          <section key={section.key}>
            <h2 className="bg-[var(--color-surface-2)]/60 px-5 py-2 text-xs font-bold uppercase tracking-wider text-[var(--color-faint)]">
              {GROUP_LABEL[section.key]}
            </h2>
            {section.items.map((n) => (
              <Row
                key={n.id}
                n={n}
                person={byId(n.personId)}
                unread={isUnread(n)}
                onSeen={() => setRead((s) => new Set(s).add(n.id))}
                followed={followed.has(n.id)}
                onFollow={() => setFollowed((s) => new Set(s).add(n.id))}
                joined={joined.has(n.id)}
                onJoin={() => setJoined((s) => new Set(s).add(n.id))}
              />
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

function Row({
  n,
  person,
  unread,
  onSeen,
  followed,
  onFollow,
  joined,
  onJoin,
}: {
  n: Notif;
  person?: Person;
  unread: boolean;
  onSeen: () => void;
  followed: boolean;
  onFollow: () => void;
  joined: boolean;
  onJoin: () => void;
}) {
  const meta = META[n.type];
  const Icon = meta.icon;

  return (
    <div
      onMouseEnter={unread ? onSeen : undefined}
      className={`relative flex items-start gap-3 border-b border-[var(--color-line)] px-5 py-4 transition hover:bg-[var(--color-surface-2)] ${
        unread ? "bg-[var(--color-brand-tint)]/40" : ""
      }`}
    >
      {unread && <span className="absolute inset-y-0 left-0 w-[3px] bg-[var(--color-brand)]" />}

      {/* avatar with type badge (or icon tile when no person) */}
      <div className="relative shrink-0">
        {person ? (
          <Avatar person={person} size={46} />
        ) : (
          <span
            className="grid size-[46px] place-items-center rounded-full"
            style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 15%, transparent)`, color: meta.color }}
          >
            <Icon className="h-6 w-6" />
          </span>
        )}
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
          <p className="text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
            {person && (
              <span className="inline-flex items-center gap-1 font-bold text-[var(--color-ink)]">
                {person.name}
                {person.verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--color-brand)]" />}
              </span>
            )}{" "}
            {n.text}
          </p>
          {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--color-brand)]" />}
        </div>

        {/* preview / quoted content */}
        {n.preview && n.type === "community" && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3 py-1 text-[13px] font-semibold text-[var(--color-ink-soft)]">
            <Users className="h-3.5 w-3.5 text-[#7c3aed]" />
            {n.preview}
          </span>
        )}
        {n.preview && n.type !== "community" && (
          <p className="mt-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
            {n.preview}
          </p>
        )}

        {/* NIN verification status pill */}
        {n.type === "verified" && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-tint)] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-brand-strong)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Processing · Listener agent
          </span>
        )}

        {/* footer: time + action */}
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-[var(--color-faint)]">{n.time} ago</span>
          <div className="flex-1" />
          {n.action === "follow" && (
            <ActionButton
              done={followed}
              onClick={onFollow}
              label={followed ? "Following" : "Follow back"}
            />
          )}
          {n.action === "join" && (
            <ActionButton done={joined} onClick={onJoin} label={joined ? "Joined" : "Join"} />
          )}
          {n.action === "rsvp" && <ActionButton label="RSVP" onClick={() => {}} />}
          {(n.type === "donation" || n.type === "milestone") && (
            <button className="flex items-center gap-0.5 text-xs font-semibold text-[var(--color-brand-strong)] hover:underline">
              View <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  done = false,
  onClick,
}: {
  label: string;
  done?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
        done
          ? "border border-[var(--color-line)] bg-white text-[var(--color-muted)]"
          : "gradient-brand text-white hover:opacity-95"
      }`}
    >
      {label}
    </button>
  );
}
