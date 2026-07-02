"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Clock,
  Download,
  MapPin,
  Plus,
  ShieldCheck,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { MEMBERS, type Member } from "@/data/mock-members";
import { scopeMembers, type AdminRole } from "@/data/admin-roles";
import { CallRoom, type CallConfig } from "@/components/call/CallRoom";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function DashboardOverview({
  role,
  onViewMembers,
  onOpenMeetings,
}: {
  role?: AdminRole;
  onViewMembers?: () => void;
  onOpenMeetings?: () => void;
}) {
  const scoped = role && role.scope.level !== "national";
  const data = useMemo(() => {
    const members = role ? scopeMembers(role.scope) : MEMBERS;
    const total = members.length;
    const active = members.filter((m) => m.status === "active").length;
    const pendingVerify = members.filter((m) => !m.ninVerified).length;
    const verified = total - pendingVerify;
    const states = new Set(members.map((m) => m.state)).size;

    // last 7 months growth (relative to Jun 2026)
    const buckets: { label: string; key: string; value: number }[] = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date(2026, 5 - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ label: MONTHS[d.getMonth()], key, value: 0 });
    }
    for (const m of members) {
      const b = buckets.find((x) => m.joined.startsWith(x.key));
      if (b) b.value++;
    }
    const newThisMonth = buckets[buckets.length - 1].value;

    const recent = [...members].sort((a, b) => (a.joined < b.joined ? 1 : -1)).slice(0, 5);
    const coordinators = members.filter((m) => m.role !== "Member").slice(0, 5);

    return {
      total, active, pendingVerify, verified, states,
      buckets, newThisMonth, recent, coordinators,
      verifiedPct: total ? Math.round((verified / total) * 100) : 0,
      activePct: total ? Math.round((active / total) * 100) : 0,
    };
  }, [role]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--color-navy)]">
            Welcome back, {role?.title ?? "Super Admin"} 👋
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--color-muted)]">
            {scoped && role ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-tint)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-brand-strong)]">
                <MapPin className="h-3 w-3" /> {role.jurisdiction}
              </span>
            ) : null}
            {role ? role.tagline : "Here's what's happening across the movement today."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewMembers}
            className="flex h-10 items-center gap-2 rounded-xl gradient-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Add member
          </button>
          <button className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-4 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          highlight
          label="Total members"
          value={data.total}
          icon={<Users className="h-4 w-4" />}
          trend={`+${data.newThisMonth} this month`}
        />
        <StatCard
          label="Active members"
          value={data.active}
          icon={<ShieldCheck className="h-4 w-4" />}
          trend={`${data.activePct}% of members`}
        />
        <StatCard
          label="Awaiting NIN"
          value={data.pendingVerify}
          icon={<Clock className="h-4 w-4" />}
          trend="Verification pending"
        />
        <StatCard
          label="States covered"
          value={data.states}
          icon={<MapPin className="h-4 w-4" />}
          trend="of 37 (36 + FCT)"
        />
      </div>

      {/* Growth + Verification */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <GrowthChart buckets={data.buckets} className="xl:col-span-2" />
        <VerificationDonut verified={data.verified} pending={data.pendingVerify} pct={data.verifiedPct} />
      </div>

      {/* Recent + Coordinators + Reminder */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <RecentMembers members={data.recent} onViewAll={onViewMembers} />
        <Coordinators members={data.coordinators} />
        <NextGathering onSchedule={onOpenMeetings} />
      </div>
    </div>
  );
}

/* ------------------------------- Pieces ------------------------------- */

function StatCard({
  label, value, icon, trend, highlight = false,
}: {
  label: string; value: number; icon: React.ReactNode; trend: string; highlight?: boolean;
}) {
  if (highlight) {
    return (
      <div className="relative overflow-hidden rounded-2xl gradient-brand p-5 text-white shadow-md">
        <div className="absolute -right-6 -top-8 size-28 rounded-full bg-white/15" />
        <div className="relative flex items-center justify-between">
          <span className="text-sm font-medium text-white/90">{label}</span>
          <span className="grid size-8 place-items-center rounded-lg bg-white/20">{icon}</span>
        </div>
        <div className="relative mt-3 text-3xl font-bold">{value}</div>
        <div className="relative mt-1 flex items-center gap-1 text-xs font-medium text-white/90">
          <TrendingUp className="h-3.5 w-3.5" />
          {trend}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-muted)]">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
          {icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-navy)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--color-faint)]">{trend}</div>
    </div>
  );
}

function GrowthChart({
  buckets, className = "",
}: {
  buckets: { label: string; value: number }[]; className?: string;
}) {
  const peakValue = Math.max(1, ...buckets.map((b) => b.value));
  const max = peakValue * 1.25; // headroom so the value badge clears the top
  const total = buckets.reduce((sum, b) => sum + b.value, 0);
  return (
    <div className={`rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-[var(--color-navy)]">Member growth</h3>
          <p className="text-xs text-[var(--color-muted)]">
            {total} new members · last 7 months
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-[var(--color-green)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--color-green)]">
          <TrendingUp className="h-3.5 w-3.5" />
          Trending up
        </span>
      </div>

      <div className="mt-6">
        {/* bars + gridlines */}
        <div className="relative flex h-44 items-end gap-2 sm:gap-3">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-px w-full bg-[var(--color-line-soft)]" />
            ))}
          </div>
          {buckets.map((b, idx) => {
            const isPeak = b.value === peakValue && b.value > 0;
            const h = (b.value / max) * 100;
            return (
              <div key={idx} className="relative flex h-full flex-1 items-end">
                <div
                  className="group relative w-full rounded-lg transition-all duration-300"
                  style={{
                    height: `${Math.max(h, 3)}%`,
                    background: isPeak
                      ? "linear-gradient(180deg, var(--color-brand), var(--color-brand-2))"
                      : "rgba(247,147,30,0.28)",
                  }}
                >
                  {isPeak && (
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-[var(--color-navy)] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      {b.value}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* labels */}
        <div className="mt-2 flex gap-2 sm:gap-3">
          {buckets.map((b, idx) => (
            <span key={idx} className="flex-1 text-center text-xs font-medium text-[var(--color-faint)]">
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function VerificationDonut({
  verified, pending, pct,
}: {
  verified: number; pending: number; pct: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-[var(--color-navy)]">NIN verification</h3>
      <p className="text-xs text-[var(--color-muted)]">Verified vs pending</p>
      <div className="mt-4 grid place-items-center">
        <div
          className="relative grid size-40 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--color-brand) ${pct}%, var(--color-line) ${pct}% 100%)` }}
        >
          <div className="grid size-28 place-items-center rounded-full bg-white">
            <div className="text-3xl font-bold text-[var(--color-navy)]">{pct}%</div>
            <div className="text-xs text-[var(--color-muted)]">Verified</div>
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-center gap-6 text-sm">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[var(--color-brand)]" />
          <span className="text-[var(--color-ink-soft)]">Verified</span>
          <span className="font-semibold text-[var(--color-navy)]">{verified}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[var(--color-line)]" />
          <span className="text-[var(--color-ink-soft)]">Pending</span>
          <span className="font-semibold text-[var(--color-navy)]">{pending}</span>
        </span>
      </div>
    </div>
  );
}

function RecentMembers({ members, onViewAll }: { members: Member[]; onViewAll?: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-[var(--color-navy)]">Recent members</h3>
        <button onClick={onViewAll} className="flex items-center gap-0.5 text-xs font-semibold text-[var(--color-brand-strong)] hover:underline">
          View all <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--color-surface-2)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-tint)] text-xs font-bold text-[var(--color-brand-strong)]">
              {initials(m.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--color-ink)]">{m.name}</div>
              <div className="truncate text-xs text-[var(--color-faint)]">{m.state} · {m.lga}</div>
            </div>
            {m.ninVerified ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--color-green)]" />
            ) : (
              <Clock className="h-4 w-4 shrink-0 text-[var(--color-faint)]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const ROLE_STYLES: Record<string, string> = {
  "National Exec": "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]",
  "State Coordinator": "bg-[var(--color-green)]/12 text-[var(--color-green)]",
  "LGA Coordinator": "bg-[#3b9dff]/12 text-[#2b7fd4]",
  "Ward Coordinator": "bg-[var(--color-amber)]/15 text-[#a96a00]",
};

function Coordinators({ members }: { members: Member[] }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-[var(--color-navy)]">Leadership</h3>
        <span className="text-xs text-[var(--color-faint)]">Coordinators</span>
      </div>
      <div className="space-y-1">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--color-surface-2)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-navy)] text-xs font-bold text-white">
              {initials(m.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--color-ink)]">{m.name}</div>
              <div className="truncate text-xs text-[var(--color-faint)]">{m.state}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${ROLE_STYLES[m.role] ?? "bg-[var(--color-line-soft)] text-[var(--color-muted)]"}`}>
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NextGathering({ onSchedule }: { onSchedule?: () => void }) {
  const [call, setCall] = useState<CallConfig | null>(null);
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      {call && <CallRoom config={call} onClose={() => setCall(null)} />}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[var(--color-navy)]">Next gathering</h3>
        <CalendarClock className="h-4 w-4 text-[var(--color-brand-strong)]" />
      </div>
      <div className="rounded-xl bg-[var(--color-surface-2)] p-4">
        <div className="text-lg font-bold text-[var(--color-navy)]">National Executive Meeting</div>
        <div className="mt-1 text-sm text-[var(--color-muted)]">Sat, 27 Jun 2026 · 2:00 – 4:00 PM</div>
        <div className="mt-1 text-xs text-[var(--color-faint)]">Online · National Excos · 24 invited</div>
      </div>
      <button
        onClick={() =>
          setCall({
            mode: "video",
            kind: "meeting",
            title: "National Executive Meeting",
            subtitle: "National Excos",
            participants: [
              { name: "Adaeze Okonkwo", color: "#e07400", role: "National Secretary" },
              { name: "Ibrahim Suleiman", color: "#1faa59", role: "National Organizer" },
              { name: "Aisha Mohammed", color: "#0d9488", role: "National Youth Lead" },
            ],
          })
        }
        className="flex h-11 items-center justify-center gap-2 rounded-xl gradient-brand text-sm font-semibold text-white transition hover:opacity-95"
      >
        <Video className="h-4 w-4" />
        Join meeting
      </button>
      <button
        onClick={onSchedule}
        className="flex items-center justify-center gap-1 text-xs font-semibold text-[var(--color-brand-strong)] hover:underline"
      >
        View full schedule <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
