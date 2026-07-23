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

/** Best-effort haptic buzz — no-op where unsupported (desktop, iOS Safari). */
function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
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
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** Bright three-note chime for a new message/notification — sharper attack
 *  and louder than before so it actually cuts through and gets noticed,
 *  plus a short buzz on devices that support it. */
export function playDing() {
  const c = getCtx();
  if (!c) return;
  beep(c, 988, 0, 0.11, 0.2, "triangle");
  beep(c, 1319, 0.1, 0.14, 0.19, "triangle");
  beep(c, 1568, 0.22, 0.16, 0.16, "triangle");
  buzz(60);
}

/** A looping ringer. `incoming` is a driving double-pulse ring — like an
 *  actual phone call, not a chime — loud and hard to miss or mistake for a
 *  passive notification. `outgoing` stays a calmer ringback tone. */
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
        // Two quick alternating bursts per cycle ("ring-ring… ring-ring…"),
        // full volume, square-edged for cut-through presence — paired with
        // a matching vibration pattern so it's commanding on mobile too.
        beep(cc, 950, 0, 0.18, 0.32, "square");
        beep(cc, 760, 0.2, 0.18, 0.32, "square");
        beep(cc, 950, 0.44, 0.18, 0.32, "square");
        beep(cc, 760, 0.64, 0.18, 0.32, "square");
        buzz([260, 130, 260, 130, 260]);
      } else {
        beep(cc, 440, 0, 0.4, 0.09);
        beep(cc, 480, 0.42, 0.4, 0.08);
      }
    };
    ring();
    this.timer = setInterval(ring, kind === "incoming" ? 1500 : 3200);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
