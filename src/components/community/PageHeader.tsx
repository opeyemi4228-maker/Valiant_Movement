"use client";

import type { ReactNode } from "react";

/**
 * The one page-header used across every member dashboard (Home aside, Community,
 * Messages, Notifications, Bookmarks) so the whole app reads as a single,
 * crafted civic product — a labelled masthead (kicker · title · subtitle),
 * not a bare social title bar. Sticky, blurred, with an optional trailing slot.
 */
export function PageHeader({
  kicker,
  title,
  subtitle,
  icon,
  count,
  trailing,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  count?: number;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/90 px-5 py-4 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[680px] items-start justify-between gap-3 xl:max-w-none">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
            {icon}
            {kicker}
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-[22px] font-extrabold leading-tight tracking-tight text-[var(--color-navy)]">
            <span className="truncate">{title}</span>
            {count != null && count > 0 && (
              <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </h1>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-[var(--color-muted)]">{subtitle}</p>}
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
    </header>
  );
}
