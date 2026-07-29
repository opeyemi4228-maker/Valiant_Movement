"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getAdminMembers, exportAdminMembersCsv, setCommunityMemberRole, type AdminMemberRow } from "@/app/actions/admin";
import type { AdminScope } from "@/data/admin-roles";

const PAGE_SIZE = 8;

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[var(--color-green)]/12 text-[var(--color-green)]",
  pending: "bg-[var(--color-amber)]/15 text-[#a96a00]",
  suspended: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
  banned: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
};

const ROLE_LABEL: Record<NonNullable<AdminMemberRow["communityRole"]>, string> = {
  owner: "Coordinator",
  admin: "Co-Coordinator",
  moderator: "Delegate",
  member: "Member",
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function StatCard({
  label, value, sub, icon,
}: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-muted)]">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
          {icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-[var(--color-navy)]">{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--color-faint)]">{sub}</div>}
    </div>
  );
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

const RECENT_WINDOW_MS = 30 * 86_400_000; // "Recently joined" = last 30 days

/** Sidebar labels that mean "no extra filter, show everyone" — anything else
 *  either matches a known segment (Verification queue, Roles & coordinators,
 *  Recently joined, Active) or is treated as a specific state name from the
 *  "By state" dropdown. */
const NO_FILTER_VIEWS = new Set(["All members", "Directory", "Segments", ""]);

export function MembersDatabase({
  scope,
  jurisdiction,
  view,
}: {
  scope?: AdminScope;
  jurisdiction?: string;
  view?: string;
} = {}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<AdminMemberRow[]>([]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState(daysAgoIso(30));
  const [exportTo, setExportTo] = useState(todayIso());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const scoped = scope && scope.level !== "national";

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
          setItems(res.items);
          setCommunityId(res.community?.id ?? null);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recentCutoff = new Date().getTime() - RECENT_WINDOW_MS;
    return items.filter((m) => {
      if (q && !(m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.phone ?? "").includes(q)))
        return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (roleFilter && m.communityRole !== roleFilter) return false;
      // Sidebar-driven segment — each link actually changes what's shown now.
      if (view && !NO_FILTER_VIEWS.has(view)) {
        if (view === "Verification queue") { if (m.verified) return false; }
        else if (view === "Roles & coordinators") { if (!m.communityRole || m.communityRole === "member") return false; }
        else if (view === "Recently joined") { if (new Date(m.joinedAt).getTime() < recentCutoff) return false; }
        else if (view === "Active") { if (m.status !== "active") return false; }
        // Otherwise `view` is a specific state name from "By state".
        else if (m.state !== view) return false;
      }
      return true;
    });
  }, [items, query, statusFilter, roleFilter, view]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const stats = useMemo(() => {
    const active = items.filter((m) => m.status === "active").length;
    const pendingVerify = items.filter((m) => !m.verified).length;
    const states = new Set(items.map((m) => m.state)).size;
    return { total: items.length, active, pendingVerify, states };
  }, [items]);

  const resetPage = () => setPage(0);

  // Jumping to a different sidebar segment (or state) should land on page 1
  // of that new, differently-filtered list, not wherever the old one was.
  // Adjusted during render (not in an effect) — the React-recommended pattern
  // for resetting state when a prop changes; safe because it bails out after
  // one extra render instead of looping.
  const [prevView, setPrevView] = useState(view);
  if (view !== prevView) {
    setPrevView(view);
    setPage(0);
  }

  async function onSetRole(memberId: string, role: "owner" | "admin" | "moderator" | "member") {
    if (!communityId) return;
    const prev = items;
    setItems((cur) => cur.map((m) => (m.id === memberId ? { ...m, communityRole: role } : m)));
    const res = await setCommunityMemberRole(communityId, memberId, role);
    if (!res.ok) setItems(prev); // roll back on failure
  }

  async function onExport() {
    setExporting(true);
    setExportError(null);
    const res = await exportAdminMembersCsv(exportFrom, exportTo);
    setExporting(false);
    if (res.ok && res.csv && res.filename) {
      downloadCsv(res.csv, res.filename);
      setExportOpen(false);
    } else {
      setExportError(res.error ?? "Couldn't build the export.");
    }
  }

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
        <p className="text-sm text-[var(--color-muted)]">Couldn&apos;t load the member database — check your connection and reload.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total members" value={stats.total} sub={scoped ? jurisdiction : "Across the movement"} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Active" value={stats.active} sub={`${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% of members`} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Awaiting NIN" value={stats.pendingVerify} sub="Verification pending" icon={<Clock className="h-4 w-4" />} />
        {scoped ? (
          <StatCard label="NIN verified" value={stats.total - stats.pendingVerify} sub={`${stats.total ? Math.round(((stats.total - stats.pendingVerify) / stats.total) * 100) : 0}% verified`} icon={<BadgeCheck className="h-4 w-4" />} />
        ) : (
          <StatCard label="States covered" value={stats.states} sub="of 37 (36 + FCT)" icon={<BadgeCheck className="h-4 w-4" />} />
        )}
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-[var(--color-line)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-navy)]">
              {view && !NO_FILTER_VIEWS.has(view) ? view : "Members database"}
            </h2>
            <p className="text-sm text-[var(--color-muted)]">
              {filtered.length} {filtered.length === 1 ? "result" : "results"}
            </p>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); resetPage(); }}
                placeholder="Search name, email, phone…"
                className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand)]/15 lg:w-72"
              />
            </div>
            {scoped && communityId && (
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); resetPage(); }}
                className="h-10 cursor-pointer rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm outline-none focus:border-[var(--color-brand)]"
              >
                <option value="">All roles</option>
                <option value="owner">Coordinator</option>
                <option value="admin">Co-Coordinator</option>
                <option value="moderator">Delegate</option>
                <option value="member">Member</option>
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
              className="h-10 cursor-pointer rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm outline-none focus:border-[var(--color-brand)]"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
            <button
              onClick={() => setExportOpen((v) => !v)}
              className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-[var(--color-line)] bg-white p-4 shadow-xl">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-faint)]">
                  Download members who joined between
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={exportFrom}
                    max={exportTo}
                    onChange={(e) => setExportFrom(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-[var(--color-line)] px-2 text-sm outline-none focus:border-[var(--color-brand)]"
                  />
                  <span className="text-xs text-[var(--color-faint)]">to</span>
                  <input
                    type="date"
                    value={exportTo}
                    min={exportFrom}
                    max={todayIso()}
                    onChange={(e) => setExportTo(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-[var(--color-line)] px-2 text-sm outline-none focus:border-[var(--color-brand)]"
                  />
                </div>
                {exportError && <p className="mt-2 text-xs font-medium text-[var(--color-danger)]">{exportError}</p>}
                <button
                  onClick={onExport}
                  disabled={exporting}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg gradient-brand text-sm font-bold text-white disabled:opacity-60"
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download CSV
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">State / LGA</th>
                {scoped && communityId && <th className="px-4 py-3">Role</th>}
                <th className="px-4 py-3">NIN</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <MemberRow key={m.id} m={m} showRole={!!(scoped && communityId)} onSetRole={onSetRole} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
                    No members match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[var(--color-line)] px-4 py-3">
          <span className="text-sm text-[var(--color-muted)]">
            Page {current + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              className="flex h-9 items-center gap-1 rounded-lg border border-[var(--color-line)] bg-white px-3 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={current >= pageCount - 1}
              className="flex h-9 items-center gap-1 rounded-lg border border-[var(--color-line)] bg-white px-3 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberRow({
  m, showRole, onSetRole,
}: {
  m: AdminMemberRow;
  showRole: boolean;
  onSetRole: (memberId: string, role: "owner" | "admin" | "moderator" | "member") => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <tr className="border-b border-[var(--color-line-soft)] transition hover:bg-[var(--color-surface-2)]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-tint)] text-xs font-bold text-[var(--color-brand-strong)]">
            {initials(m.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-[var(--color-ink)]">{m.name}</div>
            <div className="truncate text-xs text-[var(--color-faint)]">{m.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-soft)]">{m.phone ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="font-medium text-[var(--color-ink-soft)]">{m.state}</div>
        <div className="text-xs text-[var(--color-faint)]">{m.lga}</div>
      </td>
      {showRole && (
        <td className="px-4 py-3 text-[var(--color-ink-soft)]">
          {m.communityRole ? ROLE_LABEL[m.communityRole] : "—"}
        </td>
      )}
      <td className="px-4 py-3">
        {m.verified ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-green)]">
            <BadgeCheck className="h-3.5 w-3.5" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-faint)]">
            <Clock className="h-3.5 w-3.5" />
            Pending
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[m.status] ?? "bg-[var(--color-surface-2)] text-[var(--color-muted)]"}`}>
          {m.status}
        </span>
      </td>
      <td className="px-4 py-3 text-[var(--color-muted)]">{new Date(m.joinedAt).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}</td>
      <td className="relative px-4 py-3">
        {showRole ? (
          <>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="grid size-8 place-items-center rounded-lg text-[var(--color-faint)] transition hover:bg-[var(--color-line-soft)] hover:text-[var(--color-ink)]"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-4 top-full z-20 w-48 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white py-1 shadow-xl">
                  <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-faint)]">Set role</p>
                  {(["owner", "admin", "moderator", "member"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => { onSetRole(m.id, r); setMenuOpen(false); }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-[var(--color-surface-2)] ${m.communityRole === r ? "font-bold text-[var(--color-brand-strong)]" : "text-[var(--color-ink-soft)]"}`}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <button className="grid size-8 place-items-center rounded-lg text-[var(--color-faint)] transition hover:bg-[var(--color-line-soft)] hover:text-[var(--color-ink)]">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}
