"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  MEMBERS,
  MEMBER_ROLES,
  MEMBER_STATES,
  type Member,
  type MemberStatus,
} from "@/data/mock-members";
import { scopeMembers, type AdminScope } from "@/data/admin-roles";

const PAGE_SIZE = 8;

const STATUS_STYLES: Record<MemberStatus, string> = {
  active: "bg-[var(--color-green)]/12 text-[var(--color-green)]",
  pending: "bg-[var(--color-amber)]/15 text-[#a96a00]",
  suspended: "bg-[var(--color-danger)]/12 text-[var(--color-danger)]",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
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

export function MembersDatabase({ scope, jurisdiction }: { scope?: AdminScope; jurisdiction?: string } = {}) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);

  const base = useMemo(() => (scope ? scopeMembers(scope) : MEMBERS), [scope]);
  const scoped = scope && scope.level !== "national";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((m) => {
      if (q && !(m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.phone.includes(q) || m.id.toLowerCase().includes(q)))
        return false;
      if (stateFilter && m.state !== stateFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (roleFilter && m.role !== roleFilter) return false;
      return true;
    });
  }, [base, query, stateFilter, statusFilter, roleFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const stats = useMemo(() => {
    const active = base.filter((m) => m.status === "active").length;
    const pendingVerify = base.filter((m) => !m.ninVerified).length;
    const states = new Set(base.map((m) => m.state)).size;
    return { total: base.length, active, pendingVerify, states };
  }, [base]);

  const resetPage = () => setPage(0);

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
            <h2 className="text-lg font-bold text-[var(--color-navy)]">Members database</h2>
            <p className="text-sm text-[var(--color-muted)]">
              {filtered.length} {filtered.length === 1 ? "result" : "results"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPage();
                }}
                placeholder="Search name, email, phone, ID…"
                className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand)]/15 lg:w-72"
              />
            </div>
            <select
              value={stateFilter}
              onChange={(e) => { setStateFilter(e.target.value); resetPage(); }}
              className="h-10 cursor-pointer rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm outline-none focus:border-[var(--color-brand)]"
            >
              <option value="">All states</option>
              {MEMBER_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); resetPage(); }}
              className="h-10 cursor-pointer rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm outline-none focus:border-[var(--color-brand)]"
            >
              <option value="">All roles</option>
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
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
            <button className="flex h-10 items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
              <Download className="h-4 w-4" />
              Export
            </button>
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
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">NIN</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <MemberRow key={m.id} m={m} />
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

function MemberRow({ m }: { m: Member }) {
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
      <td className="px-4 py-3 text-[var(--color-ink-soft)]">{m.phone}</td>
      <td className="px-4 py-3">
        <div className="font-medium text-[var(--color-ink-soft)]">{m.state}</div>
        <div className="text-xs text-[var(--color-faint)]">{m.lga}</div>
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-soft)]">{m.role}</td>
      <td className="px-4 py-3">
        {m.ninVerified ? (
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
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[m.status]}`}>
          {m.status}
        </span>
      </td>
      <td className="px-4 py-3 text-[var(--color-muted)]">{m.joined}</td>
      <td className="px-4 py-3">
        <button className="grid size-8 place-items-center rounded-lg text-[var(--color-faint)] transition hover:bg-[var(--color-line-soft)] hover:text-[var(--color-ink)]">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
