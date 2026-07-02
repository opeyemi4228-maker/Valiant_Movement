"use client";

import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";

export function SocialButtons() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        className="flex items-center justify-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-white py-2.5 text-sm font-medium text-[var(--color-ink-soft)] transition hover:border-[#d7daea] hover:bg-[var(--color-surface-2)]"
      >
        <FcGoogle className="h-5 w-5" />
        Google
      </button>
      <button
        type="button"
        className="flex items-center justify-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-white py-2.5 text-sm font-medium text-[var(--color-ink-soft)] transition hover:border-[#d7daea] hover:bg-[var(--color-surface-2)]"
      >
        <FaFacebook className="h-5 w-5 text-[#1877f2]" />
        Facebook
      </button>
    </div>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-[var(--color-line)]" />
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--color-line)]" />
    </div>
  );
}
