"use client";

import { useEffect, useState } from "react";
import { Copy, Share2, Users, ChevronRight, X, BadgeCheck, MapPin, Gift } from "lucide-react";
import { getMyReferrals } from "@/app/actions/referrals";
import type { ReferralOverview, ReferredMember } from "@/lib/referrals-db";
import { nextTier } from "@/lib/referrals";
import { naira } from "@/data/finance";
import { Avatar } from "./Avatar";

function fmt(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n);
}

/** The member's recruitment dashboard — their referral code to share, how many
 *  people they've brought in (click to see the full list), and their reward
 *  tier with progress to the next one. */
export function ReferralCard({ onToast }: { onToast?: (m: string) => void }) {
  const [data, setData] = useState<ReferralOverview | null>(null);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyReferrals().then((d) => alive && setData(d));
    return () => { alive = false; };
  }, []);

  if (!data) {
    return <div className="h-52 animate-pulse rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)]" />;
  }

  const tier = data.tier;
  const next = nextTier(data.total);
  const toNext = next ? next.min - data.total : 0;
  const progress = next ? Math.min(100, Math.round(((data.total - tier.min) / (next.min - tier.min)) * 100)) : 100;

  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/register?ref=${data.code}` : `/register?ref=${data.code}`;
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(data.code); onToast?.("✅ Referral code copied"); } catch { onToast?.(data.code); }
  };
  const share = async () => {
    const text = `Join me in the Valiant Movement 🦅 — register with my code ${data.code}:`;
    try {
      if (navigator.share) await navigator.share({ title: "Valiant Movement", text, url: shareLink });
      else { await navigator.clipboard.writeText(`${text} ${shareLink}`); onToast?.("✅ Invite link copied"); }
    } catch { /* user dismissed */ }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      {/* Tier + count */}
      <div className="relative gradient-brand p-4 text-white">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/85">Your recruitment</span>
          <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
            {tier.emoji} {tier.name}
          </span>
        </div>
        <button onClick={() => data.total > 0 && setShowList(true)} className="mt-2 flex items-end gap-2 text-left">
          <span className="text-4xl font-extrabold leading-none tracking-tight">{fmt(data.total)}</span>
          <span className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-white/90">
            member{data.total === 1 ? "" : "s"} brought in
            {data.total > 0 && <ChevronRight className="h-4 w-4" />}
          </span>
        </button>
        <div className="mt-0.5 text-[12px] text-white/80">
          {data.thisMonth > 0 ? `+${data.thisMonth} this month` : "Invite someone this month"}
        </div>
      </div>

      {/* Progress to next tier */}
      {next && (
        <div className="border-b border-[var(--color-line)] px-4 py-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-[var(--color-ink-soft)]">
              {toNext} more to <span className="text-[var(--color-brand-strong)]">{next.emoji} {next.name}</span>
            </span>
            <span className="flex items-center gap-1 font-bold text-[var(--color-green)]">
              <Gift className="h-3.5 w-3.5" /> {naira(next.bonusNaira)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div className="h-full rounded-full gradient-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Code + share */}
      <div className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">Your referral code</div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="flex-1 rounded-xl border border-dashed border-[var(--color-brand)]/40 bg-[var(--color-brand-tint)] px-3 py-2.5 text-center text-lg font-extrabold tracking-widest text-[var(--color-brand-strong)]">
            {data.code}
          </code>
          <button onClick={copyCode} aria-label="Copy code" className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]">
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <button onClick={share} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl gradient-brand py-2.5 text-sm font-bold text-white transition hover:opacity-95">
          <Share2 className="h-4 w-4" /> Share your invite
        </button>
        <p className="mt-2 text-center text-[11px] text-[var(--color-muted)]">
          Every member who registers with your code is credited to you.
        </p>
      </div>

      {showList && <ReferralList referrals={data.referrals} onClose={() => setShowList(false)} />}
    </div>
  );
}

function ReferralList({ referrals, onClose }: { referrals: ReferredMember[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-rise relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-[var(--color-navy)]">People you brought in</h3>
              <p className="text-[11px] text-[var(--color-faint)]">{referrals.length} member{referrals.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-[var(--color-line-soft)] overflow-y-auto">
          {referrals.map((r) => (
            <div key={r.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={r.name} color="#e07400" size={40} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-1">
                  <span className="truncate text-sm font-bold text-[var(--color-ink)]">{r.name}</span>
                  {r.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" />}
                </div>
                <div className="flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
                  <MapPin className="h-3 w-3 shrink-0 text-[var(--color-faint)]" />
                  <span className="truncate">
                    {[r.ward, r.lga && `${r.lga} LGA`, r.state && `${r.state} State`].filter(Boolean).join(" · ") || "Location pending"}
                  </span>
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-[var(--color-faint)]">
                {new Date(r.joinedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
