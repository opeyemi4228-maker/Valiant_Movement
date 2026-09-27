"use client";

import type { ReactNode } from "react";

/* ============================================================
   Valiant signature pieces, shared by every dashboard so the
   whole product speaks with one voice:
   - ValiantLoader: the eagle inside a spinning orange→green ring
   - ValiantEmpty: an empty state in the movement's voice
   - ValiantRule: the thin orange→green signature line
   ============================================================ */

/** Page / panel loading state. */
export function ValiantLoader({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-label={label ?? "Loading"} className={`flex flex-col items-center gap-2.5 ${className}`}>
      <span className="relative grid size-12 place-items-center">
        <span
          aria-hidden
          className="story-ring absolute inset-0 animate-spin rounded-full"
          style={{
            // Hollow the gradient disc into a 3px ring.
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
          }}
        />
        <span aria-hidden className="animate-pulse text-xl">🦅</span>
      </span>
      {label && <span className="text-[12.5px] font-medium text-[var(--color-faint)]">{label}</span>}
    </div>
  );
}

/** Empty state: icon (or the eagle), a short title, one line of help, optional action. */
export function ValiantEmpty({
  icon,
  title,
  text,
  action,
  motto = false,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  /** Show the "Courage · Character · Service" sign-off under the copy. */
  motto?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid place-items-center px-6 py-16 text-center ${className}`}>
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
        {icon ?? <span className="text-3xl">🦅</span>}
      </div>
      <h2 className="text-[17px] font-bold text-[var(--color-ink)]">{title}</h2>
      {text && <p className="mt-1 max-w-xs text-[14px] leading-snug text-[var(--color-muted)]">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
      {motto && (
        <p className="mt-5 text-[10.5px] font-bold uppercase tracking-[0.24em] text-[var(--color-brand-strong)]">
          Courage · Character · Service
        </p>
      )}
    </div>
  );
}

/** The thin orange→green signature line under app bars and page headers. */
export function ValiantRule({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`valiant-rule h-[2px] w-full ${className}`} />;
}
