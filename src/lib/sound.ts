/* Tiny Web Audio sound kit — no asset files. Generates a message "ding"
   and looping incoming/outgoing ring tones. All guarded for SSR + autoplay. */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function beep(c: AudioContext, freq: number, startIn: number, dur: number, gain = 0.14, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(c.destination);
  const t = c.currentTime + startIn;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** Soft two-note chime for a new message. */
export function playDing() {
  const c = getCtx();
  if (!c) return;
  beep(c, 880, 0, 0.12, 0.1);
  beep(c, 1244, 0.11, 0.18, 0.09);
}

/** A looping ringer. `incoming` is a warm double-tone; `outgoing` a calmer ringback. */
export class Ringer {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(kind: "incoming" | "outgoing") {
    const c = getCtx();
    if (!c) return;
    this.stop();
    const ring = () => {
      const cc = getCtx();
      if (!cc) return;
      if (kind === "incoming") {
        beep(cc, 523, 0, 0.28, 0.13, "triangle");
        beep(cc, 660, 0.3, 0.34, 0.13, "triangle");
      } else {
        beep(cc, 440, 0, 0.4, 0.08);
        beep(cc, 480, 0.42, 0.4, 0.07);
      }
    };
    ring();
    this.timer = setInterval(ring, kind === "incoming" ? 2200 : 3200);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
