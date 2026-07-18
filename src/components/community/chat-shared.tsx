"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  Smile,
  Paperclip,
  Mic,
  Trash2,
  Send,
  Loader2,
  Play,
  Pause,
  FileText,
  Download,
} from "lucide-react";
import type { ChatMedia } from "@/app/actions/chat";

/* ============================================================
   Shared chat building blocks — used by the 1:1 Messages
   dashboard (LiveChat) and the community group chat, so both
   surfaces have the exact same feature set: text, emoji,
   attachments and voice notes, with the same bubbles.
   ============================================================ */

export const CHAT_COLORS = ["#e07400", "#1faa59", "#7c3aed", "#0ea5e9", "#e23d4e", "#f5a524", "#db2777", "#0d9488"];
export function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CHAT_COLORS[h % CHAT_COLORS.length];
}

export function clock(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export const MAX_ATTACHMENT = 5 * 1024 * 1024; // 5 MB — kept small (stored as data URL)

export function humanSize(bytes: number) {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes >= 1_000) return Math.round(bytes / 1_000) + " KB";
  return bytes + " B";
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
    (t) => MediaRecorder.isTypeSupported(t),
  );
}

// Indirected so the timestamp read is clearly a runtime (not render) call.
function nowMs() {
  return Date.now();
}

export const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😅","😉","🙂","🙃","😇","🥹","🥳",
  "😢","😭","😡","😴","🤯","🤗","🤩","😏","😜","🫡","🙏","👍","👎","👏","🙌","💪",
  "🤝","👋","✌️","🤞","🔥","✨","💯","✅","❌","⚡","⭐","🏆","🎯","💡","💬","📢",
  "❤️","🧡","💛","💚","💙","💜","🖤","🦅","🌍","🇳🇬","🗳️","⏰","📌","📎","📷","📄",
];

/* ------------------------------ emoji picker ------------------------------ */

export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute bottom-full left-2 z-20 mb-2 grid max-h-52 w-[296px] grid-cols-8 gap-0.5 overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-white p-2 shadow-xl md:left-6">
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="grid size-8 place-items-center rounded-lg text-xl leading-none transition hover:bg-[var(--color-surface-2)]"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------ media bubbles ------------------------------ */

export function ImageMedia({ media }: { media: ChatMedia }) {
  return (
    <a href={media.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
      <img
        src={media.url}
        alt={media.name ?? "image"}
        className="max-h-72 w-full cursor-zoom-in object-cover"
      />
    </a>
  );
}

export function FileCard({ media, mine }: { media: ChatMedia; mine?: boolean }) {
  return (
    <a
      href={media.url}
      download={media.name}
      className={`flex min-w-[200px] items-center gap-3 rounded-xl border p-2.5 transition hover:brightness-95 ${
        mine ? "border-black/10 bg-white/50" : "border-[var(--color-line)] bg-[var(--color-surface-2)]"
      }`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-[var(--color-ink)]">
          {media.name ?? "Document"}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
          <Download className="h-3 w-3" />
          {media.size ?? "file"} · Download
        </span>
      </span>
    </a>
  );
}

export function AudioNote({ media, mine }: { media: ChatMedia; mine?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(media.duration ?? 0);

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play();
  }

  const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;
  return (
    <div className="flex min-w-[190px] items-center gap-2.5 py-0.5">
      <button
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className={`grid size-9 shrink-0 place-items-center rounded-full ${
          mine ? "bg-[var(--color-brand-strong)] text-white" : "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
        }`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Mic className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand-strong)]" />
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-brand-strong)]"
              style={{ width: pct + "%" }}
            />
          </div>
        </div>
        <div className="mt-1 text-[10px] tabular-nums text-[var(--color-faint)]">
          {fmtTime(playing || cur ? cur : dur)}
        </div>
      </div>
      <audio
        ref={ref}
        src={media.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={() => setCur(ref.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          const d = ref.current?.duration;
          if (d && isFinite(d)) setDur(d);
        }}
      />
    </div>
  );
}

/* -------------------------------- composer --------------------------------
   The full message composer: text + Enter-to-send, emoji picker, photo/file
   attachments (≤5 MB, downscaled client-side upstream of this via data URLs)
   and hold-to-record voice notes. `onSend` returns ok:false to signal failure,
   in which case the typed text is restored so nothing is lost. */

export function Composer({
  onSend,
  disabled,
  placeholder = "Type a message",
}: {
  onSend: (body: string, media?: ChatMedia | null) => Promise<{ ok: boolean }>;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const sendAfterRef = useRef(true);

  async function sendPayload(body: string, media?: ChatMedia | null) {
    const text = body.trim();
    if ((!text && !media) || sending || disabled) return;
    setSending(true);
    if (text) setDraft("");
    setShowEmoji(false);
    const res = await onSend(text, media ?? null);
    if (!res.ok && text) setDraft(text); // restore so nothing is lost
    setSending(false);
  }

  const send = () => sendPayload(draft);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_ATTACHMENT) {
      alert("Please choose a file under 5 MB.");
      return;
    }
    const url = await blobToDataURL(f);
    const media: ChatMedia = f.type.startsWith("image/")
      ? { kind: "image", url, name: f.name, size: humanSize(f.size) }
      : { kind: "file", url, name: f.name, size: humanSize(f.size) };
    sendPayload("", media);
  }

  /* ----------------------------- voice notes ----------------------------- */
  function cleanupRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  async function startRecording() {
    if (recording || disabled) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      alert("Voice notes aren't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickAudioMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      sendAfterRef.current = true;
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        const secs = Math.max(1, Math.round((nowMs() - recStartRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        cleanupRecording();
        if (sendAfterRef.current && blob.size > 0) {
          const url = await blobToDataURL(blob);
          sendPayload("", { kind: "audio", url, duration: secs, size: humanSize(blob.size) });
        }
      };
      recorderRef.current = rec;
      recStartRef.current = nowMs();
      rec.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      cleanupRecording();
      alert("Microphone access is needed to record a voice note.");
    }
  }

  function stopRecording(deliver: boolean) {
    sendAfterRef.current = deliver;
    setRecording(false);
    try {
      recorderRef.current?.stop();
    } catch {
      cleanupRecording();
    }
  }

  // Stop any in-progress recording if the component unmounts.
  useEffect(() => () => cleanupRecording(), []);

  return (
    <div className="relative z-10 flex items-end gap-1.5 bg-white px-2.5 py-2.5 md:px-6">
      {showEmoji && <EmojiPicker onPick={(e) => setDraft((d) => d + e)} onClose={() => setShowEmoji(false)} />}
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        onChange={onPickFile}
      />

      {recording ? (
        <div className="flex flex-1 items-center gap-3 rounded-2xl bg-[var(--color-surface-2)] px-3 py-2.5">
          <button
            onClick={() => stopRecording(false)}
            aria-label="Cancel voice note"
            className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/10"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 text-sm font-bold tabular-nums text-[var(--color-danger)]">
            <span className="size-2.5 animate-pulse rounded-full bg-[var(--color-danger)]" />
            {fmtTime(recSecs)}
          </span>
          <span className="flex-1 truncate text-[13px] text-[var(--color-muted)]">Recording voice note…</span>
          <button
            onClick={() => stopRecording(true)}
            aria-label="Send voice note"
            className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand text-white shadow-sm transition hover:opacity-95"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setShowEmoji((v) => !v)}
            aria-label="Emoji"
            className={`grid size-10 shrink-0 place-items-center rounded-full transition hover:bg-[var(--color-surface-2)] ${showEmoji ? "text-[var(--color-brand-strong)]" : "text-[var(--color-muted)]"}`}
          >
            <Smile className="h-[22px] w-[22px]" />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a photo or document"
            className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
          >
            <Paperclip className="h-[21px] w-[21px]" />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder={placeholder}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 text-[15px] outline-none transition focus:border-[var(--color-brand)] focus:bg-white"
          />
          {draft.trim() ? (
            <button
              onClick={send}
              disabled={sending}
              className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand text-white shadow-sm transition enabled:hover:opacity-95 disabled:opacity-40"
              aria-label="Send"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand text-white shadow-sm transition hover:opacity-95"
              aria-label="Record a voice note"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
