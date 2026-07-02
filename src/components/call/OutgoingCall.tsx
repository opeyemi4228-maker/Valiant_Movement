"use client";

import { useEffect, useRef } from "react";
import { PhoneOff, Loader2 } from "lucide-react";
import { Ringer } from "@/lib/sound";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function OutgoingCall({
  name,
  color,
  mode,
  statusText,
  onCancel,
}: {
  name: string;
  color: string;
  mode: "voice" | "video";
  statusText?: string;
  onCancel: () => void;
}) {
  const ringer = useRef<Ringer | null>(null);

  useEffect(() => {
    ringer.current = new Ringer();
    ringer.current.start("outgoing");
    return () => ringer.current?.stop();
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-between bg-[#0b0b0f] px-6 py-16 text-white">
      <div className="mt-10 flex flex-col items-center text-center">
        <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {statusText ?? `Ringing · ${mode} call`}
        </span>

        <div className="relative mt-10 grid size-32 place-items-center">
          <span className="absolute inset-0 animate-pulse rounded-full bg-[var(--color-brand)]/20" />
          <span
            className="grid size-28 place-items-center rounded-full text-4xl font-bold text-white ring-4 ring-white/10"
            style={{ backgroundColor: color }}
          >
            {initials(name)}
          </span>
        </div>

        <h2 className="mt-8 text-3xl font-extrabold tracking-tight">{name}</h2>
        <p className="mt-1 text-sm text-white/60">Waiting for them to answer…</p>
      </div>

      <button onClick={onCancel} className="flex flex-col items-center gap-2">
        <span className="grid size-16 place-items-center rounded-full bg-[var(--color-danger)] shadow-lg transition hover:opacity-90">
          <PhoneOff className="h-7 w-7" />
        </span>
        <span className="text-xs font-medium text-white/70">Cancel</span>
      </button>
    </div>
  );
}
