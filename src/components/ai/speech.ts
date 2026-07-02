/* Minimal Web Speech API helpers (typing + getters) shared by the
   Valiant AI launcher (wake word) and panel (voice input). */

export interface SRAlternative { transcript: string }
export interface SRResult { isFinal: boolean; 0: SRAlternative }
export interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
export interface SRErrorEvent { error?: string }
export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e?: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SRCtor = new () => SpeechRecognitionLike;

export function getSRCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return getSRCtor() !== null;
}

/** Ask for microphone access. Must be called from a user gesture (click/tap).
 *  Resolves true once granted — after which SpeechRecognition.start() works
 *  without further prompts for this origin. */
export async function requestMic(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop()); // we only needed the grant
    return true;
  } catch {
    return false;
  }
}

/** Current mic permission, when the browser exposes it ("granted" | "denied" |
 *  "prompt" | "unknown"). Lets us auto-arm silently when already granted. */
export async function micPermission(): Promise<string> {
  try {
    const p = navigator.permissions as unknown as {
      query?: (d: { name: string }) => Promise<{ state: string }>;
    };
    if (!p?.query) return "unknown";
    const res = await p.query({ name: "microphone" });
    return res.state;
  } catch {
    return "unknown";
  }
}

/* ---------------------- voice selection (most human) ---------------------- */

// Highest-quality voices first — Edge neural "Natural", then Chrome "Google",
// then good deep Apple/Windows male voices. We pick the best one available.
const PREFERRED_NAMES = [
  "Microsoft Guy Online (Natural)",
  "Microsoft Christopher Online (Natural)",
  "Microsoft Eric Online (Natural)",
  "Microsoft Roger Online (Natural)",
  "Microsoft Brian Online (Natural)",
  "Microsoft Davis Online (Natural)",
  "Microsoft Tony Online (Natural)",
  "Microsoft Andrew Online (Natural)",
  "Google UK English Male",
  "Google US English",
  "Daniel (Enhanced)",
  "Daniel",
  "Arthur",
  "Aaron",
  "Rishi",
  "Oliver",
  "Microsoft David",
];

const MALE_HINTS =
  /\b(guy|christopher|eric|roger|brian|davis|tony|andrew|daniel|arthur|aaron|rishi|oliver|david|liam|james|john|mark|male|reed|gordon)\b/;
const NOVELTY =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|wobble|zarvox|trinoids|whisper|good news|jester|organ|superstar|ralph|fred|junior|kathy|deranged|hysterical|pipe|princess|trin/;
const FEMALE_HINTS =
  /\b(samantha|victoria|karen|moira|tessa|fiona|zira|susan|allison|ava|serena|aria|jenny|michelle|nora|female|catherine|hazel|linda|heera)\b/;

function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  const lang = (v.lang || "").toLowerCase();
  let s = 0;
  if (/online \(natural\)|neural|natural/.test(n)) s += 120;
  if (/google/.test(n)) s += 70;
  if (/enhanced|premium/.test(n)) s += 30;
  if (MALE_HINTS.test(n)) s += 45; // deeper timbre
  if (lang.startsWith("en")) s += 25;
  if (/en-us|en-gb|en-ng/.test(lang)) s += 12;
  if (FEMALE_HINTS.test(n)) s -= 30;
  if (NOVELTY.test(n)) s -= 200;
  return s;
}

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  for (const name of PREFERRED_NAMES) {
    const exact = voices.find((v) => v.name === name);
    if (exact) return exact;
  }
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

// Warm the voice list as early as possible (getVoices() is async on Chrome).
if (typeof window !== "undefined" && window.speechSynthesis) {
  const warm = () => { cachedVoice = pickVoice() ?? cachedVoice; };
  warm();
  window.speechSynthesis.addEventListener?.("voiceschanged", warm);
}

/** Speak text aloud with the most natural available voice (deep, human cadence). */
export function speak(text: string, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  const clean = text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;

  const run = () => {
    synth.cancel();
    const voice = cachedVoice ?? (cachedVoice = pickVoice());
    const u = new SpeechSynthesisUtterance(clean);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = "en-US";
    }
    // Neural/Google voices already sound human — keep them near-natural; basic
    // built-in voices get a lower pitch + slower rate to feel deeper and calmer.
    const natural = /natural|neural|online|google|enhanced|premium/i.test(voice?.name ?? "");
    u.pitch = natural ? 0.92 : 0.82;
    u.rate = natural ? 1.0 : 0.95;
    u.volume = 1;
    if (onStart) u.onstart = onStart;
    if (onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    synth.speak(u);
  };

  if (synth.getVoices().length) {
    run();
  } else {
    // Voices not loaded yet — wait for them once, then speak.
    const handler = () => {
      synth.removeEventListener("voiceschanged", handler);
      cachedVoice = pickVoice();
      run();
    };
    synth.addEventListener("voiceschanged", handler);
    setTimeout(() => {
      if (synth.getVoices().length) {
        synth.removeEventListener("voiceschanged", handler);
        cachedVoice = pickVoice();
        run();
      }
    }, 300);
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}
