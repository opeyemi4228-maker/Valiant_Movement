"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  Users,
  MessageSquare,
  Flag,
  TrendingUp,
  Globe2,
  MapPin,
  Search,
  MoreHorizontal,
  Heart,
  Repeat2,
  MessageCircle,
  Pin,
  EyeOff,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  ArrowUpRight,
  Activity,
  BadgeCheck,
  ShieldCheck,
} from "lucide-react";
import { communities, posts, type Community } from "@/data/community";
import { conversations } from "@/data/chat";

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

type AdminStatus = "Active" | "Pending" | "Flagged";

/** Derive an admin-facing status + report count from the demo communities. */
function adminMeta(c: Community, idx: number): { status: AdminStatus; reports: number } {
  if (!c.joined && idx % 5 === 3) return { status: "Pending", reports: 0 };
  if (idx % 4 === 1) return { status: "Flagged", reports: (idx % 3) + 1 };
  return { status: "Active", reports: 0 };
}

/* ----------------------- real-time activity feed ------------------------ */

type ActivityType = "post" | "flag" | "chat" | "pending";
interface ActivityEvent {
  id: string;
  person: string;
  action: string;
  target: string;
  time: string;
  type: ActivityType;
  fresh?: boolean;
}

const SEED_ACTIVITY: ActivityEvent[] = [
  { id: "a1", person: "Ibrahim Suleiman", action: "posted in", target: "Kano State Chapter", time: "2m ago", type: "post" },
  { id: "a2", person: "Adaeze Okonkwo", action: "created a poll in", target: "Enugu · Ward 4", time: "9m ago", type: "post" },
  { id: "a3", person: "Auto-filter", action: "flagged a comment in", target: "Youth Vanguard", time: "14m ago", type: "flag" },
  { id: "a4", person: "Aisha Mohammed", action: "started a group chat", target: "Youth Vanguard 🇳🇬", time: "22m ago", type: "chat" },
  { id: "a5", person: "Tunde Bakare", action: "requested approval for", target: "Surulere LGA Hub", time: "1h ago", type: "pending" },
];

const ACTIVITY_POOL: Omit<ActivityEvent, "id" | "time" | "fresh">[] = [
  { person: "Fatima Abubakar", action: "joined", target: "Kaduna State Chapter", type: "post" },
  { person: "Emeka Nwosu", action: "posted a photo in", target: "Imo · Polling Unit 012", type: "post" },
  { person: "Auto-filter", action: "flagged a link in", target: "Lagos State Chapter", type: "flag" },
  { person: "Segun Adeyemi", action: "requested approval for", target: "Ibadan North Hub", type: "pending" },
  { person: "Chiamaka Eze", action: "replied in", target: "Women in Leadership", type: "chat" },
  { person: "Aisha Mohammed", action: "pinned a post in", target: "Youth Vanguard", type: "post" },
];

/** Simulates a live activity stream by prepending a new event every few seconds. */
function useLiveActivity(): ActivityEvent[] {
  const [events, setEvents] = useState<ActivityEvent[]>(SEED_ACTIVITY);
  const idx = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = ACTIVITY_POOL[idx.current % ACTIVITY_POOL.length];
      idx.current += 1;
      setEvents((prev) => [
        { ...next, id: `live-${Date.now()}`, time: "just now", fresh: true },
        ...prev.map((e) => ({ ...e, fresh: false })),
      ].slice(0, 7));
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return events;
}

const TABS = [
  "Overview",
  "Communities",
  "Feed monitor",
  "Group messaging",
  "Flagged content",
  "Pending approval",
] as const;

const SCOPE_VIEWS: Record<string, Community["scope"][]> = {
  "State chapters": ["State"],
  "LGA & ward groups": ["LGA", "Ward", "Polling Unit"],
  "Interest groups": ["Interest"],
};

export function AdminCommunity({
  view,
  onViewChange,
}: {
  view: string;
  onViewChange: (v: string) => void;
}) {
  const totalMembers = communities.reduce((s, c) => s + c.members, 0);
  const totalOnline = communities.reduce((s, c) => s + c.online, 0);
  const flagged = communities.filter((c, i) => adminMeta(c, i).status === "Flagged");
  const pending = communities.filter((c, i) => adminMeta(c, i).status === "Pending");

  // "By scope" children render the Communities table (filtered) and highlight that tab.
  const scopeFilter = SCOPE_VIEWS[view];
  const activeTab: (typeof TABS)[number] = scopeFilter
    ? "Communities"
    : (TABS as readonly string[]).includes(view)
    ? (view as (typeof TABS)[number])
    : "Overview";

  return (
    <div>
      {/* Tabs (kept in sync with the sidebar) */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--color-line)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => onViewChange(t)}
            className={`relative shrink-0 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === t ? "text-[var(--color-brand-strong)]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t}
            {activeTab === t && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--color-brand)]" />
            )}
          </button>
        ))}
      </div>

      {/* Stat cards (always visible) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          highlight
          icon={<Globe2 className="h-5 w-5" />}
          value={String(communities.length)}
          label="Communities"
          sub="Across the federation"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          value={fmt(totalMembers)}
          label="Total members"
          sub={`${fmt(totalOnline)} online now`}
        />
        <StatCard
          icon={<MessageSquare className="h-5 w-5" />}
          value="12.4K"
          label="Posts today"
          sub="+18% vs yesterday"
        />
        <StatCard
          icon={<Flag className="h-5 w-5" />}
          value={String(flagged.length + 2)}
          label="Needs review"
          sub={`${pending.length} pending approval`}
          danger
        />
      </div>

      <div className="mt-5">
        {activeTab === "Overview" && <Overview onNavigate={onViewChange} />}
        {activeTab === "Communities" && (
          <CommunitiesTable scopeFilter={scopeFilter} scopeLabel={scopeFilter ? view : undefined} />
        )}
        {activeTab === "Feed monitor" && <FeedMonitor />}
        {activeTab === "Group messaging" && <GroupMessaging />}
        {activeTab === "Flagged content" && <Moderation />}
        {activeTab === "Pending approval" && <PendingApproval />}
      </div>
    </div>
  );
}

/* -------------------------------- Overview ------------------------------- */

function Overview({ onNavigate }: { onNavigate: (v: string) => void }) {
  const top = [...communities].sort((a, b) => b.members - a.members).slice(0, 5);
  const maxMembers = top[0]?.members ?? 1;

  const VIEW_FOR_TYPE: Record<string, string> = {
    post: "Feed monitor",
    flag: "Flagged content",
    chat: "Group messaging",
    pending: "Pending approval",
  };

  const activity = useLiveActivity();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Top communities */}
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-[var(--color-navy)]">Top communities by membership</h3>
          <button
            onClick={() => onNavigate("Communities")}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-strong)] transition hover:gap-1.5"
          >
            View all <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-3.5">
          {top.map((c, idx) => {
            const meta = adminMeta(c, idx);
            return (
              <div key={c.id} className="flex items-center gap-3">
                <img src={c.cover} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{c.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-[var(--color-muted)]">{fmt(c.members)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-line)]">
                    <div
                      className="h-full rounded-full gradient-brand"
                      style={{ width: `${(c.members / maxMembers) * 100}%` }}
                    />
                  </div>
                </div>
                <StatusPill status={meta.status} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Live activity */}
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--color-brand-strong)]" />
          <h3 className="font-bold text-[var(--color-navy)]">Live activity</h3>
          <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-[var(--color-green)]">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-green)]" /> Live
          </span>
        </div>
        <div className="space-y-1">
          {activity.map((a) => (
            <button
              key={a.id}
              onClick={() => onNavigate(VIEW_FOR_TYPE[a.type] ?? "Feed monitor")}
              className={`flex w-full gap-3 rounded-xl p-2 text-left transition hover:bg-[var(--color-surface-2)] ${
                a.fresh ? "animate-[pulse_1.2s_ease-in-out_2]" : ""
              }`}
            >
              <span
                className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
                  a.type === "flag"
                    ? "bg-[var(--color-danger)]/12 text-[var(--color-danger)]"
                    : a.type === "pending"
                    ? "bg-[var(--color-amber)]/15 text-[var(--color-amber)]"
                    : a.type === "chat"
                    ? "bg-[#0ea5e9]/12 text-[#0ea5e9]"
                    : "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
                }`}
              >
                {a.type === "flag" ? (
                  <Flag className="h-3.5 w-3.5" />
                ) : a.type === "chat" ? (
                  <MessageSquare className="h-3.5 w-3.5" />
                ) : a.type === "pending" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0 text-[13px] leading-snug">
                <span className="font-semibold text-[var(--color-ink)]">{a.person}</span>{" "}
                <span className="text-[var(--color-muted)]">{a.action}</span>{" "}
                <span className="font-medium text-[var(--color-ink-soft)]">{a.target}</span>
                <div className="text-[11px] text-[var(--color-faint)]">{a.time}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Communities ------------------------------ */

function CommunitiesTable({
  scopeFilter,
  scopeLabel,
}: {
  scopeFilter?: Community["scope"][];
  scopeLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const rows = communities.filter((c) => {
    if (scopeFilter && !scopeFilter.includes(c.scope)) return false;
    return `${c.name} ${c.location}`.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] p-4">
        <h3 className="font-bold text-[var(--color-navy)]">{scopeLabel ?? "All communities"}</h3>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search communities…"
            className="h-9 w-60 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-brand)] focus:bg-white focus:ring-4 focus:ring-[var(--color-brand)]/12"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
              <th className="px-4 py-3 font-semibold">Community</th>
              <th className="px-4 py-3 font-semibold">Scope</th>
              <th className="px-4 py-3 font-semibold">Members</th>
              <th className="px-4 py-3 font-semibold">Online</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Manage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, idx) => {
              const meta = adminMeta(c, idx);
              return (
                <tr key={c.id} className="border-b border-[var(--color-line-soft)] transition hover:bg-[var(--color-surface-2)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img src={c.cover} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[var(--color-ink)]">{c.name}</div>
                        <div className="truncate text-xs text-[var(--color-faint)]">{c.location}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-ink-soft)]">
                      {c.scope === "Interest" ? <Globe2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                      {c.scope}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--color-ink-soft)]">{fmt(c.members)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                      <span className="size-1.5 rounded-full bg-[var(--color-green)]" /> {fmt(c.online)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={meta.status} reports={meta.reports} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="ml-auto grid size-8 place-items-center rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ----------------------------- Feed monitor ----------------------------- */

function FeedMonitor() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {posts.map((p) => (
          <div key={p.id} className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
            <div className="flex items-start gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: p.author.color }}
              >
                {p.author.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-bold text-[var(--color-ink)]">{p.author.name}</span>
                  {p.author.verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--color-brand)]" />}
                  <span className="text-[var(--color-faint)]">· {p.time}</span>
                  {p.community && (
                    <span className="ml-1 truncate rounded-full bg-[var(--color-brand-tint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-strong)]">
                      {p.community}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-soft)]">{p.text}</p>
                <div className="mt-2.5 flex items-center gap-4 text-xs text-[var(--color-faint)]">
                  <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {fmt(p.likes)}</span>
                  <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" /> {fmt(p.reposts)}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {fmt(p.comments)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--color-line-soft)] pt-3">
                  <ModButton icon={<Pin className="h-3.5 w-3.5" />} label="Pin" />
                  <ModButton icon={<EyeOff className="h-3.5 w-3.5" />} label="Hide" />
                  <ModButton icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Flag" danger />
                </div>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}

/* --------------------------- Group messaging ---------------------------- */

function GroupMessaging() {
  const groups = conversations.filter((c) => c.isGroup);
  const directCount = conversations.length - groups.length;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white lg:col-span-2">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
          <h3 className="font-bold text-[var(--color-navy)]">Group conversations</h3>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-green)]">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-green)]" /> Live
          </span>
        </div>
        <div className="divide-y divide-[var(--color-line-soft)]">
          {groups.map((c) => {
            const last = c.messages[c.messages.length - 1];
            return (
              <div key={c.id} className="flex items-center gap-3 p-4 transition hover:bg-[var(--color-surface-2)]">
                <img src={c.groupAvatar} alt="" className="size-11 shrink-0 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-[var(--color-ink)]">{c.groupName}</span>
                    <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted)]">
                      {c.members} members
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-[var(--color-muted)]">{last?.text}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-[var(--color-faint)]">{c.lastTime}</span>
                  {c.unread > 0 ? (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
                      {c.unread}
                    </span>
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-[var(--color-green)]" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <h3 className="mb-3 font-bold text-[var(--color-navy)]">Messaging health</h3>
          <Metric label="Group chats" value={String(groups.length)} />
          <Metric label="Direct chats" value={String(directCount)} />
          <Metric label="Messages today" value="3,481" />
          <Metric label="Avg. response" value="4m 12s" />
        </div>
        <div className="rounded-2xl border border-[var(--color-brand)]/30 bg-[var(--color-brand-tint)] p-5">
          <ShieldCheck className="mb-2 h-5 w-5 text-[var(--color-brand-strong)]" />
          <p className="text-sm font-semibold text-[var(--color-ink)]">End-to-end between verified members</p>
          <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">
            Admins see metadata and reported threads only — message bodies stay private.
          </p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-line-soft)] py-2 last:border-0">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className="font-bold text-[var(--color-ink)]">{value}</span>
    </div>
  );
}

/* --------------------------- Pending approval --------------------------- */

function PendingApproval() {
  const pending = [
    { id: "pa1", name: "Surulere LGA Hub", scope: "LGA", requester: "Tunde Bakare", members: 0, time: "1h ago", cover: "/highlights/03-recognition.jpg" },
    { id: "pa2", name: "Ibadan North Hub", scope: "LGA", requester: "Segun Adeyemi", members: 0, time: "3h ago", cover: "/highlights/04-gather.jpg" },
    { id: "pa3", name: "Traders & Artisans Network", scope: "Interest", requester: "Fatima Abubakar", members: 0, time: "Yesterday", cover: "/highlights/02-movement.jpg" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
        <h3 className="font-bold text-[var(--color-navy)]">Communities awaiting approval</h3>
        <span className="rounded-full bg-[var(--color-amber)]/15 px-2.5 py-0.5 text-xs font-bold text-[var(--color-amber)]">
          {pending.length} pending
        </span>
      </div>
      <div className="divide-y divide-[var(--color-line-soft)]">
        {pending.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
            <img src={p.cover} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--color-ink)]">{p.name}</span>
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted)]">
                  {p.scope}
                </span>
              </div>
              <span className="text-xs text-[var(--color-faint)]">Requested by {p.requester} · {p.time}</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="flex items-center gap-1.5 rounded-lg bg-[var(--color-green)]/12 px-3 py-2 text-xs font-bold text-[var(--color-green)] transition hover:bg-[var(--color-green)]/20">
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 py-2 text-xs font-bold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
                <Trash2 className="h-4 w-4" /> Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Moderation ------------------------------- */

function Moderation() {
  const queue = [
    { id: "q1", reporter: "Auto-filter", reason: "Possible spam link", excerpt: "Join now for free airtime 👉 bit.ly/...", community: "Lagos State Chapter", severity: "high" as const },
    { id: "q2", reporter: "Chiamaka Eze", reason: "Harassment", excerpt: "Comment reported by 3 members in a thread.", community: "Youth Vanguard", severity: "high" as const },
    { id: "q3", reporter: "Emeka Nwosu", reason: "Off-topic", excerpt: "Repeated promotional posts unrelated to the ward.", community: "Imo · Polling Unit 012", severity: "low" as const },
    { id: "q4", reporter: "Auto-filter", reason: "Unverified claim", excerpt: "Misinformation about the verification process.", community: "Kano State Chapter", severity: "medium" as const },
  ];
  const sev = {
    high: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
    medium: "bg-[var(--color-amber)]/15 text-[var(--color-amber)]",
    low: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
        <h3 className="font-bold text-[var(--color-navy)]">Moderation queue</h3>
        <span className="rounded-full bg-[var(--color-danger)]/12 px-2.5 py-0.5 text-xs font-bold text-[var(--color-danger)]">
          {queue.length} open
        </span>
      </div>
      <div className="divide-y divide-[var(--color-line-soft)]">
        {queue.map((q) => (
          <div key={q.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${sev[q.severity]}`}>
              <Flag className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--color-ink)]">{q.reason}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sev[q.severity]}`}>
                  {q.severity}
                </span>
                <span className="text-xs text-[var(--color-faint)]">in {q.community}</span>
              </div>
              <p className="mt-0.5 truncate text-[13px] text-[var(--color-muted)]">&ldquo;{q.excerpt}&rdquo;</p>
              <span className="text-[11px] text-[var(--color-faint)]">Reported by {q.reporter}</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="flex items-center gap-1.5 rounded-lg bg-[var(--color-green)]/12 px-3 py-2 text-xs font-bold text-[var(--color-green)] transition hover:bg-[var(--color-green)]/20">
                <CheckCircle2 className="h-4 w-4" /> Keep
              </button>
              <button className="flex items-center gap-1.5 rounded-lg bg-[var(--color-danger)]/12 px-3 py-2 text-xs font-bold text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/20">
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- Shared -------------------------------- */

function StatCard({
  icon,
  value,
  label,
  sub,
  highlight,
  danger,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  sub: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight
          ? "border-transparent gradient-brand text-white"
          : "border-[var(--color-line)] bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`grid size-9 place-items-center rounded-xl ${
            highlight
              ? "bg-white/20 text-white"
              : danger
              ? "bg-[var(--color-danger)]/12 text-[var(--color-danger)]"
              : "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
          }`}
        >
          {icon}
        </span>
        <TrendingUp className={`h-4 w-4 ${highlight ? "text-white/70" : "text-[var(--color-faint)]"}`} />
      </div>
      <div className={`mt-3 text-2xl font-extrabold ${highlight ? "text-white" : "text-[var(--color-navy)]"}`}>
        {value}
      </div>
      <div className={`text-sm font-semibold ${highlight ? "text-white/90" : "text-[var(--color-ink-soft)]"}`}>
        {label}
      </div>
      <div className={`mt-0.5 text-[11px] ${highlight ? "text-white/70" : "text-[var(--color-faint)]"}`}>{sub}</div>
    </div>
  );
}

function StatusPill({ status, reports }: { status: AdminStatus; reports?: number }) {
  const styles: Record<AdminStatus, string> = {
    Active: "bg-[var(--color-green)]/12 text-[var(--color-green)]",
    Pending: "bg-[var(--color-amber)]/15 text-[var(--color-amber)]",
    Flagged: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
  };
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
      {reports ? ` · ${reports}` : ""}
    </span>
  );
}

function ModButton({ icon, label, danger }: { icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
        danger
          ? "border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/8"
          : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
