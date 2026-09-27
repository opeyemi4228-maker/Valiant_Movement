"use client";

import type { ReactNode } from "react";
import { ValiantRule } from "@/components/ui/valiant";

/**
 * The one page header used across the member dashboards (Communities,
 * Messages, Notifications, Bookmarks…) so every tab reads the same way:
 * a bold title (with an optional live count), an optional one-line
 * subtitle, and an optional trailing action slot. Simple, WhatsApp-style —
 * no kicker labels. On desktop the Valiant signature line sits beneath it
 * (on phones the app bar already carries it).
 */
export function PageHeader({
  title,
  subtitle,
  count,
  trailing,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur">
      <div className="border-b border-[var(--color-line)] px-4 pb-3 pt-4 sm:px-5 lg:border-b-0">
        <div className="mx-auto flex w-full max-w-[680px] items-center justify-between gap-3 xl:max-w-none">
          <h1 className="flex min-w-0 items-center gap-2 text-[22px] font-extrabold leading-tight tracking-tight text-[var(--color-ink)]">
            <span className="truncate">{title}</span>
            {count != null && count > 0 && (
              <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </h1>
          {trailing && <div className="shrink-0">{trailing}</div>}
        </div>
        {subtitle && (
          <p className="mx-auto mt-0.5 w-full max-w-[680px] text-[13.5px] leading-snug text-[var(--color-muted)] xl:max-w-none">
            {subtitle}
          </p>
        )}
      </div>
      <ValiantRule className="hidden lg:block" />
    </header>
  );
}
