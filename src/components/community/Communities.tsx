"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import {
  Search,
  Users,
  Plus,
  Check,
  TrendingUp,
  MapPin,
  Compass,
  Globe2,
  ChevronRight,
} from "lucide-react";
import { communities as seed, type Community } from "@/data/community";

function fmt(n: number) {
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

const FILTERS = ["Discover", "Your communities", "Chapters", "Wards", "Interest"] as const;

export function Communities() {
  const [list, setList] = useState<Community[]>(seed);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Discover");
  const [query, setQuery] = useState("");

  function toggleJoin(id: string) {
    setList((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, joined: !c.joined, members: c.members + (c.joined ? -1 : 1) }
          : c,
      ),
    );
  }

  // Live presence — online counts drift up and down so the directory feels alive.
  useEffect(() => {
    const t = setInterval(() => {
      setList((prev) =>
        prev.map((c) => {
          const drift = Math.floor(Math.random() * 9) - 4;
          return { ...c, online: Math.max(1, c.online + drift) };
        }),
      );
    }, 3500);
    return () => clearInterval(t);
  }, []);

  const filtered = list.filter((c) => {
    if (query && !`${c.name} ${c.location} ${c.description}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (filter === "Your communities") return c.joined;
    if (filter === "Chapters") return c.category === "Chapter";
    if (filter === "Wards") return c.scope === "Ward" || c.scope === "Polling Unit";
    if (filter === "Interest") return c.category === "Interest";
    return true;
  });

  const featured = list.find((c) => c.joined) ?? list[0];
  const joinedCount = list.filter((c) => c.joined).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-4 py-5 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-navy)]">
              Communities
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Organized down the federation — State, LGA, Ward and Polling Unit.
            </p>
          </div>
          <button className="flex items-center gap-2 rounded-full gradient-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95">
            <Plus className="h-4 w-4" /> Create community
          </button>
        </div>

        {/* Quick stats */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat icon={<Users className="h-4 w-4" />} value={String(joinedCount)} label="Joined" />
          <Stat icon={<Compass className="h-4 w-4" />} value={String(list.length)} label="Available" />
          <Stat icon={<TrendingUp className="h-4 w-4" />} value="4.2K" label="Active today" />
        </div>

        {/* Featured banner */}
        {featured && (
          <div className="relative mt-5 overflow-hidden rounded-3xl border border-[var(--color-line)]">
            <img src={featured.cover} alt="" className="h-44 w-full object-cover sm:h-56" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 flex flex-wrap items-end justify-between gap-3 p-5">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-brand)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  <TrendingUp className="h-3 w-3" /> Featured · {featured.scope}
                </span>
                <h2 className="mt-2 text-2xl font-extrabold text-white">{featured.name}</h2>
                <p className="mt-1 max-w-lg text-sm text-white/80">{featured.description}</p>
                <div className="mt-2 flex items-center gap-3 text-xs font-medium text-white/80">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {fmt(featured.members)} members
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-[var(--color-green)]" /> {fmt(featured.online)} online
                  </span>
                </div>
              </div>
              <button
                onClick={() => toggleJoin(featured.id)}
                className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[var(--color-ink)] transition hover:bg-white/90"
              >
                {featured.joined ? "Open community" : "Join now"}
              </button>
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="sticky top-0 z-10 -mx-4 mt-6 bg-[var(--color-bg)] px-4 py-3 lg:-mx-8 lg:px-8">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search communities by name or location…"
              className="h-11 w-full rounded-full border border-[var(--color-line)] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[var(--color-brand)]/12"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  filter === f
                    ? "bg-[var(--color-navy)] text-white"
                    : "border border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="mt-3 grid gap-4 pb-10 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CommunityCard key={c.id} c={c} onJoin={() => toggleJoin(c.id)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full grid place-items-center rounded-2xl border border-dashed border-[var(--color-line)] bg-white py-16 text-center">
              <Compass className="mb-2 h-8 w-8 text-[var(--color-faint)]" />
              <p className="text-sm text-[var(--color-muted)]">No communities match your search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-white px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-lg font-extrabold text-[var(--color-navy)]">{value}</div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
      </div>
    </div>
  );
}

function CommunityCard({ c, onJoin }: { c: Community; onJoin: () => void }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white transition hover:shadow-md">
      <div className="relative h-28 overflow-hidden">
        <img
          src={c.cover}
          alt=""
          className="size-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink)] backdrop-blur">
          {c.scope === "Interest" ? <Globe2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
          {c.scope}
        </span>
        {c.unreadPosts ? (
          <span className="absolute right-3 top-3 rounded-full bg-[var(--color-brand)] px-2 py-0.5 text-[11px] font-bold text-white">
            {c.unreadPosts} new
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[15px] font-bold text-[var(--color-ink)]">{c.name}</h3>
        <p className="mt-1 line-clamp-2 flex-1 text-[13px] leading-relaxed text-[var(--color-muted)]">
          {c.description}
        </p>
        <div className="mt-3 flex items-center gap-3 text-[12px] text-[var(--color-faint)]">
          <span className="flex items-center gap-1 font-medium">
            <Users className="h-3.5 w-3.5" /> {fmt(c.members)}
          </span>
          <span className="flex items-center gap-1 font-medium">
            <span className="size-1.5 rounded-full bg-[var(--color-green)]" /> {fmt(c.online)} online
          </span>
        </div>

        <button
          onClick={onJoin}
          className={`mt-3 flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
            c.joined
              ? "border border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
              : "gradient-brand text-white hover:opacity-95"
          }`}
        >
          {c.joined ? (
            <>
              <Check className="h-4 w-4" /> Joined
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Join
            </>
          )}
          {c.joined && <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
