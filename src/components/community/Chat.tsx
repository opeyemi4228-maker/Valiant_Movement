"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Phone,
  Video,
  MoreVertical,
  Smile,
  Paperclip,
  Mic,
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  Users,
  BellOff,
  ShieldCheck,
  PenSquare,
  Trash2,
  Play,
  Pause,
  FileText,
  Download,
  Sparkles,
} from "lucide-react";
import {
  conversations as seed,
  type Conversation,
  type ChatMessage,
} from "@/data/chat";
import { people } from "@/data/community";
import { CallRoom, type CallConfig } from "@/components/call/CallRoom";
import { Avatar } from "./Avatar";

const REPLIES = [
  "On it 👍",
  "Absolutely, count me in.",
  "Great point — let's make it happen.",
  "See you there 🦅",
  "Sharing this with the team now.",
  "💪 Courage to lead.",
  "Confirmed. I'll handle the logistics.",
];

const AMBIENT = [
  "New verification numbers just came in 🎉",
  "Can someone confirm the venue for Saturday?",
  "Posted the mobilization deck in the group.",
  "Welcome to all our new members! 🦅",
  "Reminder: town hall starts at 10am sharp.",
];

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😎", "🥳", "🤝", "🙏",
  "💪", "🔥", "🦅", "✅", "👍", "👏", "❤️", "🎉", "💯", "⭐",
  "🇳🇬", "🙌", "😅", "😉", "🤔", "👀", "📣", "📌", "💼", "🚀",
];

function bytes(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " MB";
  if (n >= 1_000) return Math.round(n / 1_000) + " KB";
  return n + " B";
}

function fmtClock(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function Chat() {
  const [convos, setConvos] = useState<Conversation[]>(seed);
  const [activeId, setActiveId] = useState<string>(seed[0].id);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [call, setCall] = useState<CallConfig | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const active = convos.find((c) => c.id === activeId)!;
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const filtered = useMemo(
    () =>
      convos.filter((c) =>
        title(c).toLowerCase().includes(query.toLowerCase()),
      ),
    [convos, query],
  );

  const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const scrollToBottom = () =>
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  const patch = (id: string, fn: (c: Conversation) => Conversation) =>
    setConvos((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));

  function openConvo(id: string) {
    setActiveId(id);
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }

  function startCall(mode: "voice" | "video") {
    const c = active;
    if (c.isGroup) {
      setCall({
        mode,
        kind: "meeting",
        title: c.groupName!,
        subtitle: `${c.members} members`,
        participants: people.slice(0, 3).map((p) => ({ name: p.name, color: p.color, photo: p.photo, role: p.role })),
      });
    } else {
      setCall({
        mode,
        kind: "call",
        title: c.person!.name,
        subtitle: "@" + c.person!.handle,
        participants: [{ name: c.person!.name, color: c.person!.color, photo: c.person!.photo, role: c.person!.role }],
      });
    }
  }

  /** Send a message of any kind (text / image / voice note / file). */
  function pushMessage(payload: Partial<ChatMessage> & { text?: string }) {
    const text = (payload.text ?? "").trim();
    if (!text && !payload.image && !payload.audioUrl && !payload.file) return;
    const convoId = activeId;
    const msgId = "m-" + Date.now();
    patch(convoId, (c) => ({
      ...c,
      lastTime: "now",
      messages: [...c.messages, { id: msgId, fromMe: true, time: clock(), status: "sent", ...payload, text }],
    }));
    setDraft("");
    scrollToBottom();

    // Simulated real-time round-trip: delivered → other typing → reply → read.
    const setStatus = (s: ChatMessage["status"]) =>
      patch(convoId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msgId ? { ...m, status: s } : m)),
      }));

    setTimeout(() => setStatus("delivered"), 700);
    setTimeout(() => patch(convoId, (c) => ({ ...c, typing: true })), 1500);
    setTimeout(() => {
      patch(convoId, (c) => ({
        ...c,
        typing: false,
        lastTime: "now",
        messages: [
          ...c.messages.map((m) => (m.fromMe ? { ...m, status: "read" as const } : m)),
          { id: "r-" + Date.now(), fromMe: false, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], time: clock() },
        ],
      }));
      if (activeIdRef.current === convoId) scrollToBottom();
    }, 3400);
  }

  function send() {
    pushMessage({ text: draft });
  }

  function insertEmoji(e: string) {
    setDraft((d) => d + e);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const f of files) {
      if (f.type.startsWith("image/")) {
        pushMessage({ image: URL.createObjectURL(f), text: draft });
      } else {
        pushMessage({ file: { name: f.name, size: bytes(f.size) }, text: draft });
      }
    }
    e.target.value = ""; // allow re-selecting the same file
  }

  // --- voice notes (real MediaRecorder) ---
  async function startRecording() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.start();
      recorderRef.current = rec;
      setRecSecs(0);
      setRecording(true);
    } catch {
      // mic blocked — nothing to record
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function sendRecording() {
    const rec = recorderRef.current;
    if (!rec) return;
    const seconds = recSecs;
    rec.onstop = () => {
      stopStream();
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      pushMessage({ audioUrl: URL.createObjectURL(blob), audioDuration: Math.max(1, seconds) });
    };
    rec.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function cancelRecording() {
    const rec = recorderRef.current;
    if (rec) {
      rec.onstop = () => stopStream();
      rec.stop();
    } else {
      stopStream();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  }

  // recording timer
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Ambient activity — other conversations receive messages over time.
  useEffect(() => {
    const t = setInterval(() => {
      setConvos((prev) => {
        const others = prev.filter((c) => c.id !== activeIdRef.current);
        if (!others.length) return prev;
        const pick = others[Math.floor(Math.random() * others.length)];
        const incoming = AMBIENT[Math.floor(Math.random() * AMBIENT.length)];
        return prev.map((c) =>
          c.id === pick.id
            ? {
                ...c,
                unread: c.unread + 1,
                lastTime: "now",
                messages: [...c.messages, { id: "amb-" + Date.now(), fromMe: false, text: incoming, time: clock() }],
              }
            : c,
        );
      });
    }, 9000);
    return () => clearInterval(t);
  }, []);

  const [showThread, setShowThread] = useState(false); // mobile: list vs thread

  return (
    <>
    {call && <CallRoom config={call} onClose={() => setCall(null)} />}
    <div className="flex h-full">
      {/* ============================ Conversation list ============================ */}
      <div
        className={`flex h-full w-full shrink-0 flex-col border-r border-[var(--color-line)] bg-white md:w-[340px] ${
          showThread ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="border-b border-[var(--color-line)] px-4 py-3.5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">Messages</h1>
            <button className="grid size-9 place-items-center rounded-full text-[var(--color-brand-strong)] transition hover:bg-[var(--color-brand-tint)]">
              <PenSquare className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or start a new chat"
              className="h-10 w-full rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-10 pr-4 text-sm outline-none transition focus:border-[var(--color-brand)] focus:bg-white focus:ring-4 focus:ring-[var(--color-brand)]/12"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Valiant AI — pinned assistant */}
          <button
            onClick={() => window.dispatchEvent(new Event("valiant-ai:open"))}
            className="flex w-full items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-brand-tint)]/40 px-3 py-3 text-left transition hover:bg-[var(--color-brand-tint)]"
          >
            <span className="relative grid size-12 shrink-0 place-items-center rounded-full gradient-brand text-white">
              <Sparkles className="h-6 w-6" />
              <span className="absolute bottom-0 right-0 size-3 rounded-full bg-[var(--color-green)] ring-2 ring-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-bold text-[var(--color-ink)]">Valiant AI</span>
                <span className="rounded-full bg-[var(--color-brand)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Assistant</span>
              </div>
              <span className="truncate text-[13px] text-[var(--color-muted)]">Voice &amp; text · say “Hey Valiant AI”</span>
            </div>
          </button>

          {filtered.map((c) => {
            const last = c.messages[c.messages.length - 1];
            return (
              <button
                key={c.id}
                onClick={() => {
                  openConvo(c.id);
                  setShowThread(true);
                }}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                  c.id === activeId ? "bg-[var(--color-brand-tint)]/60" : "hover:bg-[var(--color-surface-2)]"
                }`}
              >
                <ConvoAvatar c={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-[var(--color-ink)]">
                      {title(c)}
                    </span>
                    <span className={`shrink-0 text-[11px] ${c.unread ? "font-bold text-[var(--color-brand-strong)]" : "text-[var(--color-faint)]"}`}>
                      {c.lastTime}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-[var(--color-muted)]">
                      {c.typing ? (
                        <span className="font-medium text-[var(--color-green)]">typing…</span>
                      ) : (
                        <>
                          {last?.fromMe && <span className="text-[var(--color-faint)]">You: </span>}
                          {last?.text}
                        </>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {c.muted && <BellOff className="h-3.5 w-3.5 text-[var(--color-faint)]" />}
                      {c.unread > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ================================ Thread ================================ */}
      <div
        className={`relative h-full min-w-0 flex-1 flex-col ${showThread ? "flex" : "hidden md:flex"}`}
        style={{ backgroundColor: "#f3ede4" }}
      >
        {/* subtle pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(var(--color-ink) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />

        {/* Thread header */}
        <header className="relative z-10 flex items-center gap-3 border-b border-[var(--color-line)] bg-white px-4 py-2.5">
          <button
            onClick={() => setShowThread(false)}
            className="grid size-9 place-items-center rounded-full text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)] md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <ConvoAvatar c={active} size={42} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[15px] font-bold text-[var(--color-ink)]">{title(active)}</div>
            <div className="truncate text-xs text-[var(--color-muted)]">
              {active.isGroup
                ? `${active.members} members`
                : active.typing
                ? <span className="text-[var(--color-green)]">typing…</span>
                : active.online
                ? <span className="text-[var(--color-green)]">online</span>
                : "last seen recently"}
            </div>
          </div>
          <div className="flex items-center gap-1 text-[var(--color-muted)]">
            <button
              onClick={() => startCall("video")}
              title="Video call"
              className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)]"
            >
              <Video className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => startCall("voice")}
              title="Voice call"
              className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)]"
            >
              <Phone className="h-[18px] w-[18px]" />
            </button>
            <button className="hidden size-9 place-items-center rounded-full transition hover:bg-[var(--color-surface-2)] sm:grid">
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-surface-2)]">
              <MoreVertical className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-12">
          <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
            <div className="mx-auto mb-2 flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1 text-[11px] font-medium text-[var(--color-muted)] shadow-sm backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-green)]" />
              Messages are between verified members
            </div>
            {active.messages.map((m, idx) => {
              const prev = active.messages[idx - 1];
              const grouped = prev && prev.fromMe === m.fromMe;
              return <Bubble key={m.id} m={m} grouped={!!grouped} />;
            })}
          </div>
        </div>

        {/* Composer */}
        <div className="relative z-10 bg-white px-3 py-2.5 md:px-6">
          {recording ? (
            /* Recording bar */
            <div className="flex items-center gap-3">
              <button
                onClick={cancelRecording}
                className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/10"
                aria-label="Cancel recording"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-danger)]">
                <span className="size-2.5 animate-pulse rounded-full bg-[var(--color-danger)]" />
                {fmtClock(recSecs)}
              </span>
              <div className="flex flex-1 items-center gap-1 overflow-hidden">
                {Array.from({ length: 28 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1 shrink-0 rounded-full bg-[var(--color-brand)]/40"
                    style={{ height: `${6 + ((i * 7 + recSecs * 5) % 20)}px`, animation: "pulse 1s ease-in-out infinite", animationDelay: `${i * 40}ms` }}
                  />
                ))}
              </div>
              <span className="hidden text-xs text-[var(--color-faint)] sm:inline">Slide to cancel</span>
              <button
                onClick={sendRecording}
                className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand text-white shadow-sm transition hover:opacity-95"
                aria-label="Send voice note"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              {/* Emoji */}
              <div className="relative">
                {showEmoji && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />
                    <div className="absolute bottom-12 left-0 z-20 w-[290px] rounded-2xl border border-[var(--color-line)] bg-white p-3 shadow-xl">
                      <div className="grid grid-cols-7 gap-1">
                        {EMOJIS.map((e) => (
                          <button
                            key={e}
                            onClick={() => insertEmoji(e)}
                            className="grid size-9 place-items-center rounded-lg text-xl transition hover:bg-[var(--color-surface-2)]"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <button
                  onClick={() => setShowEmoji((v) => !v)}
                  className={`grid size-10 shrink-0 place-items-center rounded-full transition hover:bg-[var(--color-surface-2)] ${showEmoji ? "text-[var(--color-brand-strong)]" : "text-[var(--color-muted)]"}`}
                  aria-label="Emoji"
                >
                  <Smile className="h-5 w-5" />
                </button>
              </div>

              {/* Attach */}
              <button
                onClick={() => fileRef.current?.click()}
                className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
                aria-label="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <input ref={fileRef} type="file" multiple hidden onChange={onPickFile} />

              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Type a message"
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 text-[15px] outline-none transition focus:border-[var(--color-brand)] focus:bg-white"
              />
              <button
                onClick={draft.trim() ? send : startRecording}
                className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand text-white shadow-sm transition hover:opacity-95"
                aria-label={draft.trim() ? "Send" : "Record voice note"}
              >
                {draft.trim() ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

/* -------------------------------- Helpers -------------------------------- */

function title(c: Conversation) {
  return c.isGroup ? c.groupName! : c.person!.name;
}

function ConvoAvatar({ c, size = 48 }: { c: Conversation; size?: number }) {
  if (c.isGroup) {
    return (
      <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        {c.groupAvatar ? (
          <img src={c.groupAvatar} alt="" className="size-full rounded-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center rounded-full bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
            <Users className="h-1/2 w-1/2" />
          </span>
        )}
      </span>
    );
  }
  return <Avatar person={c.person} size={size} online={c.online} />;
}

function Bubble({ m, grouped }: { m: ChatMessage; grouped: boolean }) {
  const meta = (
    <span className="ml-2 mt-2 flex translate-y-1 items-center gap-0.5 text-[10px] text-[var(--color-faint)]">
      {m.time}
      {m.fromMe &&
        (m.status === "read" ? (
          <CheckCheck className="h-3.5 w-3.5 text-[#0ea5e9]" />
        ) : m.status === "delivered" ? (
          <CheckCheck className="h-3.5 w-3.5" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        ))}
    </span>
  );

  return (
    <div className={`flex ${m.fromMe ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
      <div
        className={`relative max-w-[80%] rounded-2xl p-1.5 text-[14.5px] leading-relaxed shadow-sm ${
          m.fromMe
            ? "rounded-br-md bg-[var(--color-brand-tint)] text-[var(--color-ink)]"
            : "rounded-bl-md bg-white text-[var(--color-ink)]"
        }`}
      >
        {/* Image */}
        {m.image && (
          <img src={m.image} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" />
        )}

        {/* Voice note */}
        {m.audioUrl && <VoiceNote url={m.audioUrl} duration={m.audioDuration ?? 0} self={m.fromMe} />}

        {/* File */}
        {m.file && (
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="mb-1 flex items-center gap-3 rounded-xl bg-black/[0.04] px-3 py-2.5"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-brand)] text-white">
              <FileText className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-[var(--color-ink)]">{m.file.name}</span>
              <span className="block text-[11px] text-[var(--color-faint)]">{m.file.size}</span>
            </span>
            <Download className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
          </a>
        )}

        {/* Text + meta */}
        {m.text ? (
          <div className="px-1.5 pb-0.5">
            <span className="whitespace-pre-wrap">{m.text}</span>
            <span className="float-right">{meta}</span>
          </div>
        ) : (
          <div className="flex justify-end px-1.5 pb-0.5">{meta}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Voice note ------------------------------ */

function VoiceNote({ url, duration, self }: { url: string; duration: number; self: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      a.play().catch(() => {});
    }
  }

  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1">
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration);
        }}
      />
      <button
        onClick={toggle}
        className={`grid size-9 shrink-0 place-items-center rounded-full text-white ${self ? "bg-[var(--color-brand-strong)]" : "bg-[var(--color-brand)]"}`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5" />}
      </button>
      <div className="flex w-36 items-center gap-[3px]">
        {Array.from({ length: 26 }).map((_, i) => {
          const on = i / 26 <= progress;
          return (
            <span
              key={i}
              className={`w-[3px] rounded-full ${on ? "bg-[var(--color-brand-strong)]" : "bg-[var(--color-faint)]/50"}`}
              style={{ height: `${5 + ((i * 13) % 16)}px` }}
            />
          );
        })}
      </div>
      <span className="text-[11px] tabular-nums text-[var(--color-muted)]">{fmtClock(Math.round(duration))}</span>
    </div>
  );
}
