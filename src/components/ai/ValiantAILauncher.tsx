"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Ear, EarOff } from "lucide-react";
import { ValiantAI } from "./ValiantAI";
import { getSRCtor, speechSupported, requestMic, micPermission, type SREvent, type SpeechRecognitionLike } from "./speech";

// Match "hey/hi/ok/yo <name>" OR "<name> ai" — and tolerate the common ways
// speech-to-text mishears "Valiant" (valient, gallant, violent, valent…).
const NAME = "valiant|valient|valliant|valent|gallant|violent|valued";
const WAKE = new RegExp(
  `\\b(?:hey|hi|ok|okay|yo)\\s*,?\\s*(?:${NAME})\\b|\\b(?:${NAME})\\s*(?:ai|a\\.?\\s?i)\\b`,
  "i"
);
const WAKE_PREF_KEY = "valiant-ai:wake";

export function ValiantAILauncher({ raised = false }: { raised?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [wakeOn, setWakeOn] = useState(false);
  const [wakeGreeting, setWakeGreeting] = useState(false);
  const [heard, setHeard] = useState(false); // brief "heard you" flash
  const [needsMic, setNeedsMic] = useState(false); // permission blocked → tap to allow
  const [supported, setSupported] = useState(false);
  const [armNonce, setArmNonce] = useState(0); // bump to (re)start the listener
  const wakeRef = useRef<SpeechRecognitionLike | null>(null);
  const lastFireRef = useRef(0);

  useEffect(() => {
    // Client-only capability check — deferred to avoid an SSR hydration
    // mismatch. Wake listening is ON by default (opt-out, remembered per
    // device), but the browser only lets recognition run once the mic has
    // been granted — so we auto-arm only when permission is already "granted",
    // otherwise we surface a one-tap "Enable mic" prompt.
    const ok = speechSupported();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(ok);
    if (!ok) return;
    const stored = localStorage.getItem(WAKE_PREF_KEY);
    const wantOn = stored === null ? true : stored === "1";
    if (!wantOn) return;
    micPermission().then((state) => {
      setWakeOn(true);
      setNeedsMic(state !== "granted"); // needs a gesture if not yet granted
    });
  }, []);

  // Remember the on/off choice across visits.
  useEffect(() => {
    if (supported) localStorage.setItem(WAKE_PREF_KEY, wakeOn ? "1" : "0");
  }, [wakeOn, supported]);

  // Allow other parts of the app (e.g. the Messages list) to open the assistant.
  useEffect(() => {
    const onOpen = () => {
      setWakeGreeting(false);
      setOpen(true);
    };
    window.addEventListener("valiant-ai:open", onOpen);
    return () => window.removeEventListener("valiant-ai:open", onOpen);
  }, []);

  // Wake-word listener — a self-healing loop that keeps listening for
  // "Hey Valiant AI" the whole time it's enabled and the panel is closed.
  // Browsers stop continuous recognition periodically (and after each result),
  // so we always restart it on `end`/`error`. A cooldown stops one utterance
  // from firing twice.
  useEffect(() => {
    if (!wakeOn || open) return;
    const Ctor = getSRCtor();
    if (!Ctor) return;

    let stopped = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let current: SpeechRecognitionLike | null = null;

    const restart = (delay: number) => {
      if (stopped) return;
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(begin, delay);
    };

    function begin() {
      if (stopped) return;
      const recog = new Ctor!();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "en-US";
      recog.onresult = (e: SREvent) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (WAKE.test(e.results[i][0].transcript)) {
            if (Date.now() - lastFireRef.current < 2000) return; // debounce repeats
            lastFireRef.current = Date.now();
            setHeard(true);
            setTimeout(() => setHeard(false), 1500);
            setWakeGreeting(true);
            setOpen(true); // effect re-runs (open=true) → this listener tears down
            return;
          }
        }
      };
      recog.onend = () => {
        current = null;
        restart(250); // keep it alive — recognition ends on its own
      };
      recog.onerror = (e) => {
        const err = e?.error;
        if (err === "not-allowed" || err === "service-not-allowed") {
          // Mic blocked — stop the loop and surface the "Enable mic" prompt.
          // Re-arming happens explicitly via requestMic() + armNonce.
          stopped = true;
          setNeedsMic(true);
          return;
        }
        // "no-speech"/"aborted"/"network" etc. — just restart after a beat.
        restart(500);
      };
      current = recog;
      wakeRef.current = recog;
      try {
        recog.start();
        setNeedsMic(false); // started OK → mic is available
      } catch {
        restart(500); // e.g. "already started" while the old one releases the mic
      }
    }

    begin();

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (current) {
        current.onend = null;
        current.onerror = null;
        current.onresult = null;
        try { current.abort(); } catch { /* ignore */ }
      }
      wakeRef.current = null;
    };
  }, [wakeOn, open, armNonce]);

  // Turn wake listening on/off, and request mic permission via this user
  // gesture (the only reliable way to unblock recognition). Re-arms the
  // listener with armNonce once granted.
  async function toggleWake() {
    if (wakeOn && !needsMic) {
      setWakeOn(false);
      return;
    }
    const ok = await requestMic();
    setNeedsMic(!ok);
    setWakeOn(true);
    setArmNonce((n) => n + 1);
  }

  function closePanel() {
    setOpen(false);
    setWakeGreeting(false);
  }

  return (
    <>
      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-[70] sm:inset-auto sm:bottom-24 sm:right-6">
          <div className="absolute inset-0 bg-black/40 sm:hidden" onClick={closePanel} />
          <div className="absolute inset-0 sm:static sm:h-[600px] sm:max-h-[80vh] sm:w-[400px] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-[var(--color-line)] sm:shadow-2xl">
            <ValiantAI onClose={closePanel} wakeGreeting={wakeGreeting} />
          </div>
        </div>
      )}

      {/* Floating controls — pushed up on screens with a bottom composer
          (e.g. the chat) so the orb never sits on the voice-note / send button. */}
      {!open && (
        <div
          className={`fixed z-[65] flex flex-col items-end gap-2 ${
            raised
              ? "bottom-36 right-4 sm:bottom-24 sm:right-6"
              : "bottom-20 right-4 sm:bottom-6 sm:right-6"
          }`}
        >
          {/* heard flash */}
          {heard && (
            <span className="rounded-full bg-[var(--color-green)] px-3 py-1 text-xs font-bold text-white shadow-lg">
              Heard you 🦅
            </span>
          )}

          {/* wake toggle */}
          {supported && (
            <button
              onClick={toggleWake}
              title={
                wakeOn && needsMic
                  ? "Tap to allow your microphone"
                  : wakeOn
                  ? "Stop listening for “Hey Valiant AI”"
                  : "Listen for “Hey Valiant AI”"
              }
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-md transition ${
                wakeOn && needsMic
                  ? "bg-[var(--color-amber)] text-white"
                  : wakeOn
                  ? "bg-[var(--color-navy)] text-white"
                  : "border border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {wakeOn ? <Ear className="h-3.5 w-3.5" /> : <EarOff className="h-3.5 w-3.5" />}
              {wakeOn && needsMic ? "Allow mic" : wakeOn ? "Listening" : "Wake word"}
            </button>
          )}

          {/* orb */}
          <button
            onClick={() => { setWakeGreeting(false); setOpen(true); }}
            aria-label="Open Valiant AI"
            className="relative grid size-14 place-items-center rounded-full gradient-brand text-white shadow-xl ring-4 ring-[var(--color-brand)]/20 transition hover:scale-105 active:scale-95"
          >
            <Sparkles className="h-6 w-6" />
            {wakeOn && <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-brand)]/40" />}
          </button>
        </div>
      )}
    </>
  );
}
