"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Landmark,
  Globe2,
  Home,
  Vote,
  Users,
  Search,
  ChevronRight,
  Loader2,
  MapPin,
  TrendingUp,
  Layers,
  CheckCircle2,
  RefreshCcw,
} from "lucide-react";
import { getChapters, type ChaptersResult } from "@/app/actions/associations";
import type { ChapterLevel, ChapterPath, ChapterRow } from "@/lib/associations-db";

function fmt(n: number) {
  return n.toLocaleString("en-NG");
}

const LEVEL_META: Record<ChapterLevel, { icon: typeof Landmark; unit: string; units: string; color: string }> = {
  states: { icon: Landmark, unit: "State", units: "States", color: "var(--color-brand)" },
  lgas: { icon: Globe2, unit: "LGA", units: "LGAs", color: "#7c3aed" },
  wards: { icon: Home, unit: "Ward", units: "Wards", color: "#0ea5e9" },
  pollingUnits: { icon: Vote, unit: "Polling unit", units: "Polling units", color: "var(--color-green)" },
};

/** Sidebar labels that mean "top of the tree" rather than a specific state. */
const ROOT_LABELS = new Set(["National HQ", "State chapters", "LGA & ward units", "Associations", "At a glance", "Overview"]);

export function Associations({ focus }: { focus?: string } = {}) {
  const [path, setPath] = useState<ChapterPath>({});
  const [data, setData] = useState<ChaptersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback((p: ChapterPath) => {
    setLoading(true);
    getChapters(p).then((res) => {
      setData(res);
      if (res.view) setPath(res.view.path); // adopt the scope-clamped path
      setLoading(false);
    });
  }, []);

  // Driven by the coordinator sidebar: "National HQ" (or the section root)
  // jumps to the top; a state name drills straight into that chapter. The
  // dashboard's own breadcrumb/drill still works independently below.
  useEffect(() => {
    const f = focus ?? "";
    const p: ChapterPath = !f || ROOT_LABELS.has(f) ? {} : { stateName: f };
    const id = setTimeout(() => { setQuery(""); load(p); }, 0); // after paint
    return () => clearTimeout(id);
  }, [focus, load]);

  const view = data?.view ?? null;
  const meta = view ? LEVEL_META[view.level] : LEVEL_META.states;

  const filtered = useMemo(() => {
    if (!view) return [];
    const q = query.trim().toLowerCase();
    return q ? view.rows.filter((r) => r.name.toLowerCase().includes(q)) : view.rows;
  }, [view, query]);

  const maxCount = view?.rows.reduce((m, r) => Math.max(m, r.count), 0) ?? 0;

  function drill(row: ChapterRow) {
    if (!row.drillable || !view) return;
    const next: ChapterPath =
      view.level === "states"
        ? { stateName: row.name }
        : view.level === "lgas"
        ? { ...path, lgaName: row.name }
        : { ...path, ward: row.name };
    setQuery("");
    load(next);
  }

  /* ----------------------------- breadcrumb ----------------------------- */
  const crumbs = useMemo(() => {
    const root = data?.root ?? {};
    const filled = [path.stateName, path.lgaName, path.ward];
    const currentDepth = filled.filter(Boolean).length;
    const homeDepth = [root.stateName, root.lgaName, root.ward].filter(Boolean).length;
    const labels = ["All states", path.stateName, path.lgaName, path.ward];
    const out: { label: string; target: ChapterPath; current: boolean }[] = [];
    for (let i = homeDepth; i <= currentDepth; i++) {
      out.push({
        label: (i === 0 ? "All states" : labels[i]) as string,
        target: {
          stateName: i >= 1 ? path.stateName : undefined,
          lgaName: i >= 2 ? path.lgaName : undefined,
          ward: i >= 3 ? path.ward : undefined,
        },
        current: i === currentDepth,
      });
    }
    return out;
  }, [path, data]);

  const heading =
    view?.level === "states"
      ? "State chapters"
      : view?.level === "lgas"
      ? `${path.stateName} State`
      : view?.level === "wards"
      ? `${path.lgaName} LGA`
      : path.ward ?? "Chapter";
  const subheading =
    view?.level === "states"
      ? "Membership across every state of the federation"
      : view?.level === "lgas"
      ? "Local government areas"
      : view?.level === "wards"
      ? "Wards"
      : "Polling units";

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Breadcrumb */}
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-[var(--color-faint)]" />}
            {c.current ? (
              <span className="font-semibold text-[var(--color-navy)]">{c.label}</span>
            ) : (
              <button
                onClick={() => load(c.target)}
                className="rounded-md px-1.5 py-0.5 font-medium text-[var(--color-brand-strong)] transition hover:bg-[var(--color-brand-tint)]"
              >
                {c.label}
              </button>
            )}
          </span>
        ))}
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-2xl"
            style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 15%, transparent)`, color: meta.color }}
          >
            <meta.icon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">{heading}</h1>
            <p className="text-sm text-[var(--color-muted)]">{subheading}</p>
          </div>
        </div>
        <button
          onClick={() => load(path)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Users className="h-5 w-5" />} label="Total members" value={view ? fmt(view.total) : "—"} good />
        <StatCard icon={<Layers className="h-5 w-5" />} label={meta.units} value={view ? fmt(view.units) : "—"} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label={`Active ${meta.units.toLowerCase()}`} value={view ? fmt(view.populated) : "—"} />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={`Largest ${meta.unit.toLowerCase()}`}
          value={view?.rows[0] && view.rows[0].count > 0 ? view.rows[0].name : "—"}
          sub={view?.rows[0] && view.rows[0].count > 0 ? `${fmt(view.rows[0].count)} members` : undefined}
        />
      </div>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${meta.units.toLowerCase()}…`}
          className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand)]/12"
        />
      </div>

      {/* List */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
        {loading && !view ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
          </div>
        ) : !data?.ok ? (
          <div className="grid place-items-center py-16 text-center text-sm text-[var(--color-muted)]">
            Couldn&apos;t load chapters. <button onClick={() => load(path)} className="ml-1 font-semibold text-[var(--color-brand-strong)] hover:underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <MapPin className="mb-2 h-7 w-7 text-[var(--color-faint)]" />
            <p className="text-sm text-[var(--color-muted)]">
              {query ? "No matches." : `No ${meta.units.toLowerCase()} with members here yet.`}
            </p>
          </div>
        ) : (
          filtered.map((r, i) => (
            <ChapterRowView
              key={r.key || r.name || i}
              rank={i + 1}
              row={r}
              max={maxCount}
              color={meta.color}
              onClick={() => drill(r)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------- stat card ------------------------------- */

function StatCard({
  icon,
  label,
  value,
  sub,
  good = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-white p-4">
      <span
        className={`grid size-9 place-items-center rounded-xl ${
          good ? "bg-[var(--color-green)]/12 text-[var(--color-green)]" : "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
        }`}
      >
        {icon}
      </span>
      <div className="mt-3 truncate text-lg font-extrabold text-[var(--color-navy)]">{value}</div>
      <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">{label}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}

/* -------------------------------- row -------------------------------- */

function ChapterRowView({
  rank,
  row,
  max,
  color,
  onClick,
}: {
  rank: number;
  row: ChapterRow;
  max: number;
  color: string;
  onClick: () => void;
}) {
  const pct = max > 0 ? Math.round((row.count / max) * 100) : 0;
  const Comp = row.drillable ? "button" : "div";
  return (
    <Comp
      onClick={row.drillable ? onClick : undefined}
      className={`flex w-full items-center gap-3 border-b border-[var(--color-line)] px-4 py-3 text-left last:border-b-0 ${
        row.drillable ? "transition hover:bg-[var(--color-surface-2)]" : ""
      }`}
    >
      <span className="w-6 shrink-0 text-center text-[13px] font-bold text-[var(--color-faint)]">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[15px] font-semibold text-[var(--color-ink)]">{row.name}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-[var(--color-ink)]">
            <Users className="h-3.5 w-3.5 text-[var(--color-faint)]" /> {fmt(row.count)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
      {row.drillable && <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-faint)]" />}
    </Comp>
  );
}
