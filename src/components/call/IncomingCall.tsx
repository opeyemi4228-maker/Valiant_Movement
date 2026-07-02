"use client";

import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video as VideoIcon } from "lucide-react";
import type { CallSignal } from "@/lib/call-types";
import { Ringer } from "@/lib/sound";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function IncomingCall({
  call,
  onAccept,
  onDecline,
}: {
  call: CallSignal;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const ringer = useRef<Ringer | null>(null);

  useEffect(() => {
    ringer.current = new Ringer();
    ringer.current.start("incoming");
    // vibrate on supported devices
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    return () => {
      ringer.current?.stop();
      navigator.vibrate?.(0);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-between bg-[#0b0b0f] px-6 py-16 text-white">
      <div className="mt-6 flex flex-col items-center text-center">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
          Incoming {call.mode} call
        </span>

        <div className="relative mt-10 grid size-36 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-brand)]/25" />
          <span className="absolute inset-3 rounded-full bg-[var(--color-brand)]/15" />
          <span
            className="grid size-28 place-items-center rounded-full text-4xl font-bold text-white ring-4 ring-white/10"
            style={{ backgroundColor: call.callerColor }}
          >
            {initials(call.callerName)}
          </span>
        </div>

        <h2 className="mt-8 text-3xl font-extrabold tracking-tight">{call.callerName}</h2>
        <p className="mt-1 text-sm text-white/60">Valiant Movement · verified member</p>
      </div>

      <div className="flex w-full max-w-xs items-center justify-between">
        <button onClick={onDecline} className="flex flex-col items-center gap-2">
          <span className="grid size-16 place-items-center rounded-full bg-[var(--color-danger)] shadow-lg transition hover:opacity-90">
            <PhoneOff className="h-7 w-7" />
          </span>
          <span className="text-xs font-medium text-white/70">Decline</span>
        </button>
        <button onClick={onAccept} className="flex flex-col items-center gap-2">
          <span className="grid size-16 animate-bounce place-items-center rounded-full bg-[var(--color-green)] shadow-lg transition hover:opacity-90">
            {call.mode === "video" ? <VideoIcon className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
          </span>
          <span className="text-xs font-medium text-white/70">Accept</span>
        </button>
      </div>
    </div>
  );
}
