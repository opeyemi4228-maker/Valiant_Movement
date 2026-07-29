"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { getAdminMembers, exportAdminMembersCsv, type AdminMemberRow } from "@/app/actions/admin";
import type { AdminRole } from "@/data/admin-roles";
import { CallRoom, type CallConfig } from "@/components/call/CallRoom";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROLE_LABEL: Record<NonNullable<AdminMemberRow["communityRole"]>, string> = {
  owner: "Coordinator",
  admin: "Co-Coordinator",
  moderator: "Delegate",
  member: "Member",
};

interface DashboardData {
  total: number; active: number; inactive: number; pendingVerify: number; verified: number; states: number;
  buckets: { label: string; key: string; value: number }[];
  newThisMonth: number; newThisWeek: number; verifiedThisWeek: number;
  recent: AdminMemberRow[]; coordinators: AdminMemberRow[];
  byState: [string, number][];
  verifiedPct: number; activePct: number;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Every Insights/Reports sidebar leaf that used to render nothing at all —
 *  now each one drills into a focused slice of the same real data instead of
 *  always showing the same "At a glance" overview regardless of what was
 *  clicked. */
const INSIGHT_VIEWS = new Set([
  "New members this month",
  "Verification rate",
  "Active vs inactive",
  "Weekly summary",
  "State coverage",
]);

export function DashboardOverview({
  role,
  view,
  onViewMembers,
  onOpenMeetings,
}: {
  role?: AdminRole;
  view?: string;
  onViewMembers?: () => void;
  onOpenMeetings?: () => void;
}) {
  const scoped = role && role.scope.level !== "national";
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [members, setMembers] = useState<AdminMemberRow[]>([]);

  useEffect(() => {
    let alive = true;
    const attempt = (n: number) => {
      getAdminMembers()
        .then((res) => {
          if (!alive) return;
          if (!res) {
            if (n < 4) { setTimeout(() => { if (alive) attempt(n + 1); }, 800 * (n + 1)); return; }
            setState("error");
            return;
          }
          setMembers(res.items);
          setState("ready");
        })
        .catch(() => {
          if (!alive) return;
          if (n < 4) setTimeout(() => { if (alive) attempt(n + 1); }, 800 * (n + 1));
          else setState("error");
        });
    };
    attempt(0);
    return () => { alive = false; };
  }, []);

  const data: DashboardData = useMemo(() => {
    const total = members.length;
    const active = members.filter((m) => m.status === "active").length;
    const inactive = total - active;
    const pendingVerify = members.filter((m) => !m.verified).length;
    const verified = total - pendingVerify;
    const states = new Set(members.map((m) => m.state)).size;
    const now = new Date();

    // last 7 months growth
    const buckets: { label: string; key: string; value: number }[] = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ label: MONTHS[d.getMonth()], key, value: 0 });
    }
    for (const m of members) {
      const key = m.joinedAt.slice(0, 7);
      const b = buckets.find((x) => x.key === key);
      if (b) b.value++;
    }
    const newThisMonth = buckets[buckets.length - 1].value;

    const sevenDaysAgo = now.getTime() - 7 * 86_400_000;
    const newThisWeek = members.filter((m) => new Date(m.joinedAt).getTime() >= sevenDaysAgo).length;
    const verifiedThisWeek = members.filter(
      (m) => m.verified && new Date(m.joinedAt).getTime() >= sevenDaysAgo,
    ).length;

    const recent = [...members].sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1)).slice(0, 8);
    const coordinators = members.filter((m) => m.communityRole && m.communityRole !== "member").slice(0, 8);
    const byState = new Map<string, number>();
    for (const m of members) byState.set(m.state, (byState.get(m.state) ?? 0) + 1);

    return {
      total, active, inactive, pendingVerify, verified, states,
      buckets, newThisMonth, newThisWeek, verifiedThisWeek, recent, coordinators,
      byState: [...byState.entries()].sort((a, b) => b[1] - a[1]),
      verifiedPct: total ? Math.round((verified / total) * 100) : 0,
      activePct: total ? Math.round((active / total) * 100) : 0,
    };
  }, [members]);

  if (state === "loading") {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-[var(--color-line)] bg-white text-center">
        <p className="text-sm text-[var(--color-muted)]">Couldn&apos;t load the dashboard — check your connection and reload.</p>
      </div>
    );
  }

  if (view && INSIGHT_VIEWS.has(view)) {
    return <InsightDetail view={view} role={role} data={data} onBack={() => onViewMembers?.()} />;
  }

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

/* --------------------------- Insight/report drill-ins --------------------------- */

function InsightDetail({
  view, role, data, onBack,
}: {
  view: string;
  role?: AdminRole;
  data: DashboardData;
  onBack: () => void;
}) {
  const [exporting, setExporting] = useState(false);

  async function exportWeek() {
    setExporting(true);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const res = await exportAdminMembersCsv(from, to);
    setExporting(false);
    if (res.ok && res.csv && res.filename) downloadCsv(res.csv, res.filename);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-xs font-semibold text-[var(--color-brand-strong)] hover:underline">
            ← Back to dashboard
          </button>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-[var(--color-navy)]">{view}</h2>
        </div>
        {(view === "Weekly summary" || view === "New members this month") && (
          <button
            onClick={exportWeek}
            disabled={exporting}
            className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-4 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export list
          </button>
        )}
      </div>

      {view === "New members this month" && (
        <div className="grid gap-5 xl:grid-cols-3">
          <GrowthChart buckets={data.buckets} className="xl:col-span-2" />
          <StatCard label="New this month" value={data.newThisMonth} icon={<Users className="h-4 w-4" />} trend={`${data.newThisWeek} in the last 7 days`} />
        </div>
      )}

      {view === "Verification rate" && (
        <div className="grid gap-5 xl:grid-cols-3">
          <VerificationDonut verified={data.verified} pending={data.pendingVerify} pct={data.verifiedPct} />
          <StatCard label="Verified this week" value={data.verifiedThisWeek} icon={<BadgeCheck className="h-4 w-4" />} trend="Newly NIN-verified in 7 days" />
          <StatCard label="Awaiting NIN" value={data.pendingVerify} icon={<Clock className="h-4 w-4" />} trend={`${100 - data.verifiedPct}% of members`} />
        </div>
      )}

      {view === "Active vs inactive" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard highlight label="Active" value={data.active} icon={<ShieldCheck className="h-4 w-4" />} trend={`${data.activePct}% of members`} />
          <StatCard label="Inactive / suspended" value={data.inactive} icon={<Clock className="h-4 w-4" />} trend={`${100 - data.activePct}% of members`} />
        </div>
      )}

      {view === "Weekly summary" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard highlight label="New members" value={data.newThisWeek} icon={<Users className="h-4 w-4" />} trend="Last 7 days" />
          <StatCard label="Newly verified" value={data.verifiedThisWeek} icon={<BadgeCheck className="h-4 w-4" />} trend="Last 7 days" />
          <StatCard label={role?.scope.level === "national" ? "States covered" : "Jurisdiction"} value={role?.scope.level === "national" ? data.states : role?.jurisdiction ?? "—"} icon={<MapPin className="h-4 w-4" />} trend={role?.tagline ?? ""} />
        </div>
      )}

      {view === "State coverage" && (
        <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5">
          <h3 className="mb-3 text-base font-bold text-[var(--color-navy)]">Members by state</h3>
          {data.byState.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No members yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.byState.map(([state, count]) => (
                <div key={state} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm font-medium text-[var(--color-ink-soft)]">{state}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-line)]">
                    <div
                      className="h-full rounded-full gradient-brand"
                      style={{ width: `${(count / data.byState[0][1]) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-bold text-[var(--color-navy)]">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Pieces ------------------------------- */

function StatCard({
  label, value, icon, trend, highlight = false,
}: {
  label: string; value: number | string; icon: React.ReactNode; trend: string; highlight?: boolean;
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

function RecentMembers({ members, onViewAll }: { members: AdminMemberRow[]; onViewAll?: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-[var(--color-navy)]">Recent members</h3>
        <button onClick={onViewAll} className="flex items-center gap-0.5 text-xs font-semibold text-[var(--color-brand-strong)] hover:underline">
          View all <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        {members.length === 0 && <p className="px-2 py-4 text-sm text-[var(--color-muted)]">No members yet.</p>}
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--color-surface-2)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-tint)] text-xs font-bold text-[var(--color-brand-strong)]">
              {initials(m.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--color-ink)]">{m.name}</div>
              <div className="truncate text-xs text-[var(--color-faint)]">{m.state} · {m.lga}</div>
            </div>
            {m.verified ? (
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
  owner: "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]",
  admin: "bg-[var(--color-green)]/12 text-[var(--color-green)]",
  moderator: "bg-[var(--color-amber)]/15 text-[#a96a00]",
};

function Coordinators({ members }: { members: AdminMemberRow[] }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-[var(--color-navy)]">Leadership</h3>
        <span className="text-xs text-[var(--color-faint)]">Coordinators &amp; delegates</span>
      </div>
      <div className="space-y-1">
        {members.length === 0 && (
          <p className="px-2 py-4 text-sm text-[var(--color-muted)]">No coordinators or delegates appointed yet.</p>
        )}
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--color-surface-2)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-navy)] text-xs font-bold text-white">
              {initials(m.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--color-ink)]">{m.name}</div>
              <div className="truncate text-xs text-[var(--color-faint)]">{m.state}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${m.communityRole ? ROLE_STYLES[m.communityRole] ?? "bg-[var(--color-line-soft)] text-[var(--color-muted)]" : ""}`}>
              {m.communityRole ? ROLE_LABEL[m.communityRole] : ""}
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
