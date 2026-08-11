"use client";

import { useEffect, useState } from "react";
import { Trophy, Users, TrendingUp, UserPlus } from "lucide-react";
import { getReferralLeaderboard, type LeaderboardView } from "@/app/actions/referrals";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
const MEDAL = ["🥇", "🥈", "🥉"];
const COLORS = ["#e07400", "#1faa59", "#7c3aed", "#0ea5e9", "#e23d4e", "#f5a524"];
const colorFor = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

/** Coordinator recruitment scoreboard — top members bringing new people into the
 *  movement, scoped to the signed-in coordinator's jurisdiction. */
export function ReferralLeaderboard() {
  const [data, setData] = useState<LeaderboardView | null>(null);

  useEffect(() => {
    let alive = true;
    getReferralLeaderboard().then((d) => alive && setData(d));
    return () => { alive = false; };
  }, []);

  if (!data) {
    return <div className="h-64 animate-pulse rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)]" />;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-bold text-[var(--color-navy)]">Recruitment leaderboard</h3>
            <p className="text-[11px] text-[var(--color-faint)]">
              Top recruiters{data.jurisdiction ? ` · ${data.jurisdiction}` : " · movement-wide"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--color-ink-soft)]">
            <UserPlus className="h-3.5 w-3.5 text-[var(--color-green)]" /> {data.totalReferrals} joined
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--color-ink-soft)]">
            <Users className="h-3.5 w-3.5 text-[var(--color-brand-strong)]" /> {data.activeRecruiters} recruiters
          </span>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <div className="px-4 py-12 text-center text-[13px] text-[var(--color-muted)]">
          No referrals yet in this jurisdiction. Members climb the board as they bring people in.
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-line-soft)]">
          {data.rows.map((r, i) => (
            <div key={r.userId} className="flex items-center gap-3 px-4 py-3">
              <span className="w-7 shrink-0 text-center text-lg font-extrabold tabular-nums">
                {i < 3 ? MEDAL[i] : <span className="text-[13px] text-[var(--color-faint)]">{i + 1}</span>}
              </span>
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: colorFor(r.userId) }}
              >
                {initials(r.name)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-[var(--color-ink)]">{r.name}</span>
                  <span className="shrink-0 text-[11px]" title={r.tier.name}>{r.tier.emoji}</span>
                </div>
                <div className="truncate text-[11px] text-[var(--color-muted)]">
                  {[r.ward, r.lga && `${r.lga} LGA`, r.state && `${r.state}`].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              {r.thisMonth > 0 && (
                <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[var(--color-green)]/12 px-2 py-0.5 text-[11px] font-bold text-[var(--color-green)] sm:flex">
                  <TrendingUp className="h-3 w-3" /> +{r.thisMonth}
                </span>
              )}
              <div className="shrink-0 text-right">
                <div className="text-lg font-extrabold tabular-nums text-[var(--color-brand-strong)]">{r.total}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-faint)]">brought in</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
