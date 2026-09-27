"use client";

/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck } from "lucide-react";

/* ============================================================
   First-run welcome: three full-screen slides over a drifting
   collage of real movement photos, ending at sign-in. Swipe,
   arrow keys, the dots or the button all move between slides.
   Finishing (or skipping) sets `vm_welcomed`, so `/` sends the
   visitor straight to sign-in from then on.
   ============================================================ */

const SLIDES = [
  {
    kicker: "Courage to Lead",
    lead: "One Nigeria.",
    accent: "One Movement.",
    text: "Join verified Nigerians organising together, from every ward to the nation.",
  },
  {
    kicker: "Your ward · Your voice",
    lead: "Your Ward.",
    accent: "Your Voice.",
    text: "You're placed in your State, LGA, Ward and Polling Unit community the moment you join.",
  },
  {
    kicker: "Every member verified",
    lead: "Lead",
    accent: "Together.",
    text: "Post, chat, call, give and rise, all on one NIN\u2011verified identity.",
  },
];

const PHOTOS = [
  "/highlights/01-voice.jpg",
  "/highlights/02-movement.jpg",
  "/highlights/03-recognition.jpg",
  "/highlights/04-gather.jpg",
  "/highlights/05-lead.jpg",
  "/highlights/06-serve.jpg",
];

/** Columns (3 on phones, 5 on wide screens), each in a different order so
 *  the wall never looks tiled. */
const COLUMNS = [
  [0, 3, 1, 4],
  [2, 5, 0, 3],
  [4, 1, 5, 2],
  [1, 4, 2, 5],
  [3, 0, 4, 1],
];

function markWelcomed() {
  try {
    document.cookie = "vm_welcomed=1; max-age=31536000; path=/; samesite=lax";
  } catch {
    /* cookies blocked — the welcome simply shows again next time */
  }
}

export function Welcome() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const startX = useRef<number | null>(null);

  const finish = useCallback(() => {
    markWelcomed();
    router.push("/login");
  }, [router]);

  const next = useCallback(() => (last ? finish() : setI((n) => n + 1)), [last, finish]);
  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    router.prefetch("/login");
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  return (
    <main
      className="relative isolate h-dvh select-none overflow-hidden bg-[#0e0905] text-white"
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => {
        if (startX.current == null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (dx < -50) next();
        else if (dx > 50) prev();
      }}
    >
      {/* ============================ Photo collage ============================ */}
      <div
        aria-hidden
        className="absolute inset-[-12%] -z-20 grid grid-cols-3 gap-3 transition-transform duration-700 ease-out sm:gap-4 lg:grid-cols-5"
        style={{ transform: `rotate(-8deg) translateX(${-i * 4}%)` }}
      >
        {COLUMNS.map((col, c) => (
          <div key={c} className={`overflow-hidden ${c >= 3 ? "hidden lg:block" : ""}`}>
            <div className={`flex flex-col gap-3 sm:gap-4 ${c % 2 === 1 ? "animate-drift-down" : "animate-drift-up"}`}>
              {[...col, ...col].map((p, k) => (
                <div key={k} className="relative aspect-[3/4] overflow-hidden rounded-2xl ring-1 ring-white/10">
                  <Image
                    src={PHOTOS[p]}
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 40vw, 22vw"
                    loading="eager"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Veils: darken for legibility, warm Valiant glow from below */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[#0e0905]/55 backdrop-blur-[2px]" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to bottom, #0e0905 0%, rgba(14,9,5,0.35) 22%, rgba(14,9,5,0.2) 45%, rgba(14,9,5,0.92) 72%, #0e0905 100%)," +
            "radial-gradient(90% 55% at 50% 100%, rgba(247,147,30,0.35), transparent 70%)",
        }}
      />

      {/* ================================ Top bar ================================ */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <span className="inline-flex items-center rounded-xl bg-white p-1.5 shadow-lg">
          <img src="/valiant-logo.png" alt="Valiant Movement" className="h-7 w-auto" />
        </span>
        <button
          onClick={finish}
          className={`rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-white/85 ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 ${
            last ? "invisible" : ""
          }`}
        >
          Skip
        </button>
      </div>

      {/* ================================ Slides ================================ */}
      <div className="absolute inset-x-0 bottom-0 z-10 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md">
          <div className="overflow-hidden" aria-roledescription="carousel" aria-label="Welcome to Valiant Movement">
            <div
              className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: `translateX(-${i * 100}%)` }}
            >
              {SLIDES.map((s, k) => (
                <section
                  key={k}
                  aria-roledescription="slide"
                  aria-label={`${k + 1} of ${SLIDES.length}`}
                  aria-hidden={k !== i}
                  className={`w-full shrink-0 px-7 text-center transition-opacity duration-500 ${k === i ? "opacity-100" : "opacity-0"}`}
                >
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-brand)] ring-1 ring-white/10 backdrop-blur">
                    <BadgeCheck className="h-3.5 w-3.5" /> {s.kicker}
                  </p>
                  <h1 className="mt-4 text-[40px] font-extrabold leading-[1.02] tracking-tight sm:text-[46px]">
                    {s.lead}
                    <br />
                    <span className="bg-gradient-to-r from-[#ffb347] via-[var(--color-brand)] to-[#ff6a1a] bg-clip-text text-transparent">
                      {s.accent}
                    </span>
                  </h1>
                  <p className="mx-auto mt-3.5 max-w-[20rem] text-[15px] leading-relaxed text-white/75">{s.text}</p>
                </section>
              ))}
            </div>
          </div>

          <div className="mt-8 px-7">
            <button
              onClick={next}
              className="group flex h-14 w-full items-center justify-between rounded-full bg-gradient-to-r from-[var(--color-brand)] via-[#ff7a18] to-[#e8501c] pl-7 pr-2 text-[16px] font-bold text-white shadow-[0_12px_32px_-8px_rgba(247,147,30,0.65)] transition active:scale-[0.98]"
            >
              {last ? "Get Started" : "Next"}
              <span className="grid size-10 place-items-center rounded-full bg-white/20 transition group-hover:translate-x-0.5">
                <ArrowRight className="h-5 w-5" />
              </span>
            </button>

            {/* Page dots */}
            <div className="mt-5 flex justify-center gap-2">
              {SLIDES.map((_, k) => (
                <button
                  key={k}
                  onClick={() => setI(k)}
                  aria-label={`Go to slide ${k + 1}`}
                  aria-current={k === i ? "step" : undefined}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    k === i ? "w-7 bg-[var(--color-brand)]" : "w-2 bg-white/30 hover:bg-white/50"
                  }`}
                />
              ))}
            </div>

            <p className={`mt-5 text-center text-[13.5px] text-white/60 transition-opacity ${last ? "opacity-100" : "opacity-0"}`}>
              New to the movement?{" "}
              <Link
                href="/register"
                onClick={markWelcomed}
                tabIndex={last ? 0 : -1}
                className="font-bold text-white underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
