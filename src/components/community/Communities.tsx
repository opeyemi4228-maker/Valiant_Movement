"use client";

import { useEffect, useState } from "react";
import {
  Users,
  MapPin,
  Megaphone,
  ShieldCheck,
  ChevronRight,
  Landmark,
  Globe2,
  Home,
  Vote,
  X,
  Loader2,
} from "lucide-react";
import { getMyCommunities, getCommunityMembers, type MyCommunitiesResult } from "@/app/actions/communities";
import type { CommunityDTO, CommunityMemberDTO, CommunityScope } from "@/lib/communities";
import { Avatar } from "./Avatar";

function fmt(n: number) {
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

const SCOPE_META: Record<CommunityScope, { icon: typeof Users; label: string; color: string }> = {
  national: { icon: Megaphone, label: "National", color: "var(--color-navy)" },
  state: { icon: Landmark, label: "State chapter", color: "var(--color-brand)" },
  lga: { icon: Globe2, label: "LGA group", color: "#7c3aed" },
  ward: { icon: Home, label: "Ward group", color: "#0ea5e9" },
  polling_unit: { icon: Vote, label: "Polling unit", color: "var(--color-green)" },
  interest: { icon: Users, label: "Interest group", color: "var(--color-amber)" },
};

export function Communities() {
  const [res, setRes] = useState<MyCommunitiesResult | null>(null);
  const [open, setOpen] = useState<CommunityDTO | null>(null);

  useEffect(() => {
    let alive = true;
    getMyCommunities().then((r) => { if (alive) setRes(r); });
    return () => { alive = false; };
  }, []);

  /* ------------------------------ loading ------------------------------ */
  if (!res) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }

  /* ---------------------------- unavailable ---------------------------- */
  if (!res.available) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
            <Users className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-navy)]">Communities are place-based</h2>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">{res.reason}</p>
        </div>
      </div>
    );
  }

  const parent = res.items.find((c) => c.scope === "state") ?? null;
  const groups = res.items.filter((c) => c.scope !== "state");
  const p = res.placement;

  return (
    <div className="h-full overflow-y-auto">
      {open && <MembersSheet community={open} onClose={() => setOpen(null)} />}

      <div className="w-full px-4 py-5 lg:px-8">
        {/* Header + placement breadcrumb */}
        <div className="mb-4">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">Your community</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-[var(--color-ink-soft)]">
            <MapPin className="h-3.5 w-3.5 text-[var(--color-brand-strong)]" />
            {[p?.state && `${p.state} State`, p?.lga && `${p.lga} LGA`, p?.ward, p?.pollingUnit]
              .filter(Boolean)
              .map((g, i, arr) => (
                <span key={g as string} className="flex items-center gap-1.5">
                  <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5">{g}</span>
                  {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-[var(--color-faint)]" />}
                </span>
              ))}
          </div>
          <p className="mt-2 text-[13px] text-[var(--color-muted)]">
            You were placed in these automatically when you registered — every verified Valiant near you is here.
          </p>
        </div>

        {/* State community — the parent (announcement channel) */}
        {parent && <ParentCard c={parent} onOpen={() => setOpen(parent)} />}

        {/* Groups inside the community */}
        {groups.length > 0 && (
          <>
            <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-[var(--color-faint)]">
              Groups you&apos;re in
            </h2>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
              {groups.map((c, i) => (
                <GroupRow key={c.id} c={c} first={i === 0} onOpen={() => setOpen(c)} />
              ))}
            </div>
          </>
        )}

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-[var(--color-faint)]">
          Your placement comes from your registration (State › LGA › Ward › Polling Unit) and is verified by NIN.
          To move groups, update your profile placement.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------- parent card ----------------------------- */

function ParentCard({ c, onOpen }: { c: CommunityDTO; onOpen: () => void }) {
  const meta = SCOPE_META[c.scope];
  const Icon = meta.icon;
  return (
    <div className="relative overflow-hidden rounded-3xl gradient-brand p-5 text-white shadow-sm">
      <div className="absolute -right-10 -top-12 size-44 rounded-full bg-white/10" />
      <div className="absolute -bottom-14 right-20 size-36 rounded-full bg-white/10" />
      <div className="relative">
        <div className="flex items-start gap-3.5">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/25">
            <Icon className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">{meta.label}</div>
            <h2 className="truncate text-xl font-extrabold tracking-tight">{c.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/85">
              <span className="flex items-center gap-1.5 font-semibold">
                <Users className="h-3.5 w-3.5" /> {fmt(c.memberCount)} member{c.memberCount === 1 ? "" : "s"}
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> {c.controlledBy}
              </span>
            </div>
          </div>
        </div>
        {c.description && <p className="mt-3 text-sm leading-relaxed text-white/85">{c.description}</p>}
        <button
          onClick={onOpen}
          className="mt-4 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[var(--color-brand-strong)] shadow-sm transition hover:bg-white/90"
        >
          <Users className="h-4 w-4" /> View members
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ group row ------------------------------ */

function GroupRow({ c, first, onOpen }: { c: CommunityDTO; first: boolean; onOpen: () => void }) {
  const meta = SCOPE_META[c.scope];
  const Icon = meta.icon;
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--color-surface-2)] ${
        first ? "" : "border-t border-[var(--color-line)]"
      }`}
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-bold text-[var(--color-ink)]">{c.name}</span>
          <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
            {meta.label}
          </span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-[var(--color-muted)]">
          <span className="flex items-center gap-1 font-semibold text-[var(--color-ink-soft)]">
            <Users className="h-3 w-3" /> {fmt(c.memberCount)}
          </span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> {c.controlledBy}
          </span>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-faint)]" />
    </button>
  );
}

/* ---------------------------- members sheet ---------------------------- */

function MembersSheet({ community, onClose }: { community: CommunityDTO; onClose: () => void }) {
  const [members, setMembers] = useState<CommunityMemberDTO[] | null>(null);

  useEffect(() => {
    let alive = true;
    getCommunityMembers(community.id).then((m) => { if (alive) setMembers(m); });
    return () => { alive = false; };
  }, [community.id]);

  const meta = SCOPE_META[community.scope];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-[var(--color-line)] p-4">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
          >
            <meta.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold text-[var(--color-navy)]">{community.name}</h3>
            <p className="text-xs text-[var(--color-muted)]">
              {fmt(community.memberCount)} member{community.memberCount === 1 ? "" : "s"} · {community.controlledBy}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!members ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-brand)]" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--color-muted)]">No members yet.</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl p-2.5">
                <Avatar name={m.name} color="#e07400" size={38} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{m.name}</div>
                  <div className="text-xs text-[var(--color-faint)]">
                    Joined {new Date(m.joinedAt).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                </div>
                {m.role !== "member" && (
                  <span className="shrink-0 rounded-full bg-[var(--color-brand-tint)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-strong)]">
                    {m.role}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
