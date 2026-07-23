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
  Phone,
  Video,
} from "lucide-react";
import { getMyCommunities, getCommunityMembers, getCommunitiesUnread, type MyCommunitiesResult } from "@/app/actions/communities";
import type { CommunityDTO, CommunityMemberDTO, CommunityScope } from "@/lib/communities";
import type { StartCallDetail } from "@/components/call/CallCenter";
import { Avatar } from "./Avatar";
import { CommunityChat } from "./CommunityChat";
import { colorFor } from "./chat-shared";

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
  const [chat, setChat] = useState<CommunityDTO | null>(null);
  const [unreadByCommunity, setUnreadByCommunity] = useState<Record<string, number>>({});

  // Per-community unread badge (mirrors the per-conversation badge in
  // Messages) — polled independently of the one-time community list load.
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        // `null` means every retry was exhausted — keep the current badges
        // rather than wiping them to zero; the next tick recovers.
        const map = await getCommunitiesUnread();
        if (alive && map) setUnreadByCommunity(map);
      } finally {
        inFlight = false;
      }
    };
    tick();
    const t = setInterval(tick, 1500); // matches the rest of the app's real-time feel
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Opening a community marks its chat read server-side (getMessages does
  // this as a side effect); clear the badge optimistically here too so it
  // doesn't wait for the next poll tick to disappear.
  function openChat(c: CommunityDTO) {
    setChat(c);
    setUnreadByCommunity((prev) => (prev[c.id] ? { ...prev, [c.id]: 0 } : prev));
  }

  useEffect(() => {
    let alive = true;
    // Retries on top of the server's own retry — a transient failure (or a
    // rejected promise with no .catch()) previously left this stuck on its
    // loading spinner forever, since nothing else ever flips it.
    const attempt = (n: number) => {
      getMyCommunities()
        .then((r) => {
          if (!alive) return;
          if (r.error && n < 6) {
            setTimeout(() => { if (alive) attempt(n + 1); }, Math.min(800 * (n + 1), 4000));
            return;
          }
          setRes(r);
        })
        .catch(() => {
          if (!alive) return;
          if (n < 6) setTimeout(() => { if (alive) attempt(n + 1); }, Math.min(800 * (n + 1), 4000));
        });
    };
    attempt(0);
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
  const ordered = [parent, ...groups].filter((c): c is CommunityDTO => !!c);
  const p = res.placement;

  return (
    <div className="flex h-full">
      {open && <MembersSheet community={open} onClose={() => setOpen(null)} />}

      {/* ===================== Group list — always on the left, same
          pattern as Messages, so switching groups never means leaving and
          re-entering. ===================== */}
      <div className={`flex h-full w-full shrink-0 flex-col overflow-y-auto border-r border-[var(--color-line)] bg-white md:w-[340px] ${chat ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-[var(--color-line)] px-4 py-3.5">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">Communities</h1>
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
        </div>

        <div className="min-h-0 flex-1">
          {ordered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">No communities yet.</p>
          ) : (
            ordered.map((c, i) => (
              <GroupRow
                key={c.id}
                c={c}
                first={i === 0}
                active={chat?.id === c.id}
                unread={unreadByCommunity[c.id] ?? 0}
                onOpen={() => openChat(c)}
              />
            ))
          )}
        </div>

        <p className="border-t border-[var(--color-line)] px-4 py-3 text-[11px] leading-relaxed text-[var(--color-faint)]">
          Your placement comes from your registration (State › LGA › Ward › Polling Unit), verified by NIN.
        </p>
      </div>

      {/* ===================== Chat panel ===================== */}
      <div className={`relative h-full min-w-0 flex-1 flex-col ${chat ? "flex" : "hidden md:flex"}`}>
        {!chat ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-brand-strong)]">
                <Users className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium text-[var(--color-muted)]">Select a community to open its group chat</p>
            </div>
          </div>
        ) : (
          // No `key` here on purpose — keying on chat.id would force a full
          // unmount/remount on every switch, which is exactly what defeats
          // the per-community cache below (every switch would re-show the
          // "joining…" spinner and re-fetch from scratch). Staying mounted
          // and reacting to the `community` prop change is what makes
          // switching between groups instant.
          <CommunityChat
            community={chat}
            onBack={() => setChat(null)}
            onShowMembers={() => setOpen(chat)}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------ group row ------------------------------ */

function GroupRow({
  c,
  first,
  active,
  unread,
  onOpen,
}: {
  c: CommunityDTO;
  first: boolean;
  active: boolean;
  unread: number;
  onOpen: () => void;
}) {
  const meta = SCOPE_META[c.scope];
  const Icon = meta.icon;
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
        active ? "bg-[var(--color-brand-tint)]/60" : "hover:bg-[var(--color-surface-2)]"
      } ${first ? "" : "border-t border-[var(--color-line)]"}`}
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
      {unread > 0 && (
        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
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

  // Ring a fellow member 1:1 through the global call center (same rules as
  // Messages — calling yourself or someone you haven't chatted with yet is
  // rejected there with a friendly toast).
  function callMember(m: CommunityMemberDTO, mode: "voice" | "video") {
    const detail: StartCallDetail = { calleeId: m.id, name: m.name, color: colorFor(m.id), mode };
    window.dispatchEvent(new CustomEvent("valiant-call:start", { detail }));
    onClose();
  }

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
              <div key={m.id} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-[var(--color-surface-2)]">
                <Avatar name={m.name} color={colorFor(m.id)} photo={m.avatar ?? undefined} size={38} />
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
                <div className="flex shrink-0 items-center gap-0.5 text-[var(--color-muted)]">
                  <button
                    onClick={() => callMember(m, "video")}
                    title={`Video call ${m.name}`}
                    aria-label={`Video call ${m.name}`}
                    className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)]"
                  >
                    <Video className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    onClick={() => callMember(m, "voice")}
                    title={`Voice call ${m.name}`}
                    aria-label={`Voice call ${m.name}`}
                    className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)]"
                  >
                    <Phone className="h-[18px] w-[18px]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
