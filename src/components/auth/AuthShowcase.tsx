"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ShieldCheck, Users, Sparkles } from "lucide-react";

interface Slide {
  image: string;
  eyebrow: string;
  title: string;
  caption: string;
}

const SLIDES: Slide[] = [
  {
    image: "/highlights/01-voice.jpg",
    eyebrow: "Courage to Lead",
    title: "Your voice,\namplified.",
    caption: "Stand up, speak out, and move the nation forward — together as one movement.",
  },
  {
    image: "/highlights/02-movement.jpg",
    eyebrow: "One movement, every state",
    title: "Stronger\ntogether.",
    caption: "Thousands of valiant Nigerians, united across all 36 states and the FCT.",
  },
  {
    image: "/highlights/03-recognition.jpg",
    eyebrow: "Recognised & celebrated",
    title: "Leaders earn\ntheir honour.",
    caption: "Service is seen and rewarded. Rise through the ranks of the movement.",
  },
  {
    image: "/highlights/04-gather.jpg",
    eyebrow: "From your ward to the nation",
    title: "We gather.\nWe grow.",
    caption: "Find your people — by state, LGA, ward and polling unit.",
  },
  {
    image: "/highlights/05-lead.jpg",
    eyebrow: "Built on conviction",
    title: "Take the\nplatform.",
    caption: "Every member verified, every voice counted. No bots, just the movement.",
  },
  {
    image: "/highlights/06-serve.jpg",
    eyebrow: "Service before self",
    title: "Courage.\nCharacter. Service.",
    caption: "Community impact you can see — feeding, building, and lifting one another.",
  },
];

const TRUST = [
  { icon: ShieldCheck, label: "NIN-verified members" },
  { icon: Users, label: "Nationwide community" },
  { icon: Sparkles, label: "Ward-level reach" },
];

export default function AuthShowcase() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[index];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] bg-[var(--color-ink)]">
      {/* Rotating image */}
      <AnimatePresence mode="popLayout">
        <motion.img
          key={slide.image}
          src={slide.image}
          alt=""
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>

      {/* Gradient veils for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#160f08] via-[#160f08]/40 to-[#160f08]/10" />
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-brand)]/25 to-transparent mix-blend-overlay" />

      {/* Brand logo */}
      <div className="absolute left-6 top-6">
        <span className="inline-flex items-center rounded-xl bg-white/95 px-3 py-2 shadow-lg ring-1 ring-black/5 backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valiant-logo.png" alt="Valiant Movement" className="h-7 w-auto" />
        </span>
      </div>

      {/* Rotating copy */}
      <div className="absolute inset-x-0 bottom-0 p-7 sm:p-9">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
              {slide.eyebrow}
            </p>
            <h2 className="whitespace-pre-line text-4xl font-bold leading-[1.02] text-white sm:text-5xl">
              {slide.title}
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
              {slide.caption}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Trust strip */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          {TRUST.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 text-xs font-medium text-white/80"
            >
              <Icon className="h-3.5 w-3.5 text-[var(--color-brand)]" />
              {label}
            </span>
          ))}
        </div>

        {/* Progress dots */}
        <div className="mt-6 flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === index ? 28 : 8,
                background: i === index ? "var(--color-brand)" : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
