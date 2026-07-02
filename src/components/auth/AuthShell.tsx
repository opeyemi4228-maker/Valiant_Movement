/* eslint-disable @next/next/no-img-element */
import { type ReactNode } from "react";
import { ShieldCheck, Sparkles, Users } from "lucide-react";
import AuthShowcase from "./AuthShowcase";
import { BrandLogo } from "./BrandLogo";

const TRUST = [
  { icon: ShieldCheck, label: "NIN-verified" },
  { icon: Users, label: "Nationwide" },
  { icon: Sparkles, label: "Ward-level" },
];

function MobileHero() {
  return (
    <div className="relative h-72 overflow-hidden rounded-b-[2rem] lg:hidden">
      <img
        src="/highlights/02-movement.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
      {/* legibility + brand veils */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#160f08] via-[#160f08]/55 to-[#160f08]/10" />
      <div className="absolute inset-0 bg-gradient-to-tr from-[var(--color-brand)]/45 to-transparent mix-blend-overlay" />

      {/* sharp-edged logo */}
      <BrandLogo className="absolute left-5 top-5" imgClass="h-8" />

      {/* copy */}
      <div className="absolute inset-x-0 bottom-0 p-6">
        <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
          Courage to Lead
        </p>
        <h2 className="text-[1.7rem] font-bold leading-tight text-white">
          Join the movement.
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {TRUST.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 text-xs font-medium text-white/85"
            >
              <Icon className="h-3.5 w-3.5 text-[var(--color-brand)]" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[var(--color-bg)]">
      <MobileHero />

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-2 lg:p-6 lg:min-h-screen">
        {/* Form side */}
        <div className="flex items-center justify-center px-1 py-6 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">{children}</div>
        </div>

        {/* Showcase side (desktop) */}
        <div className="hidden lg:block">
          <div className="sticky top-6 h-[calc(100vh-3rem)]">
            <AuthShowcase />
          </div>
        </div>
      </div>
    </div>
  );
}
