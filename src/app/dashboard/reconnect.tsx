"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect } from "react";
import { Loader2, WifiOff } from "lucide-react";

/**
 * Shown when the session lookup transiently fails (typically a Neon
 * serverless cold-start that outlasted the in-request retry budget). We do NOT
 * log the member out — we auto-reload after a short pause, by which point the
 * database has woken up. Capped upstream so a genuine outage falls through to
 * <ConnectionError/> instead of reloading forever.
 */
export function Reconnecting({ next }: { next: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = next;
    }, 1500);
    return () => clearTimeout(t);
  }, [next]);

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-6 text-center">
      <div className="max-w-sm">
        <span className="mx-auto mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5">
          <img src="/valiant-logo.png" alt="Valiant Movement" className="h-full w-auto object-contain" />
        </span>
        <div className="flex items-center justify-center gap-2 text-[var(--color-ink)]">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--color-brand-strong)]" />
          <h1 className="text-lg font-bold">Reconnecting…</h1>
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          Waking the servers — this only takes a moment. You&apos;re still signed in.
        </p>
      </div>
    </div>
  );
}

/** Terminal state after repeated reconnect attempts fail — offers a manual retry. */
export function ConnectionError() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-6 text-center">
      <div className="max-w-sm">
        <span className="mx-auto mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
          <WifiOff className="h-7 w-7" />
        </span>
        <h1 className="text-lg font-bold text-[var(--color-navy)]">Having trouble connecting</h1>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          We couldn&apos;t reach the servers. Check your connection and try again — your account is safe.
        </p>
        <a
          href="/dashboard"
          className="mt-4 inline-flex items-center gap-2 rounded-full gradient-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95"
        >
          Try again
        </a>
      </div>
    </div>
  );
}
