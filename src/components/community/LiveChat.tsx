"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Phone,
  Video,
  MoreVertical,
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  ShieldCheck,
  PenSquare,
  Sparkles,
  Plus,
  X,
  Loader2,
  MessageSquarePlus,
  UserPlus,
  Smile,
  Paperclip,
  Mic,
  Trash2,
  Play,
  Pause,
  FileText,
  Download,
} from "lucide-react";
import {
  loadChat,
  getMessages,
  sendMessage,
  startDirect,
  refreshConversations,
  type ChatMember,
  type ChatConversation,
  type ChatMessageDTO,
  type ChatMedia,
} from "@/app/actions/chat";
import { callEligibility } from "@/app/actions/realtime";
import type { CallEligibility } from "@/lib/demo-store";
import type { StartCallDetail } from "@/components/call/CallCenter";
import { Avatar } from "./Avatar";

const COLORS = ["#e07400", "#1faa59", "#7c3aed", "#0ea5e9", "#e23d4e", "#f5a524", "#db2777", "#0d9488"];
function colorFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
function clock(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return clock(iso);
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

/* ------------------------------ media helpers ------------------------------ */

const MAX_ATTACHMENT = 5 * 1024 * 1024; // 5 MB — kept small (stored as data URL)

function humanSize(bytes: number) {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes >= 1_000) return Math.round(bytes / 1_000) + " KB";
  return bytes + " B";
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

// Indirected so the timestamp read is clearly a runtime (not render) call.
function nowMs() {
  return Date.now();
}

function blobToDataURL(blob: Blob): Promise<string> {
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

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😅","😉","🙂","🙃","😇","🥹","🥳",
  "😢","😭","😡","😴","🤯","🤗","🤩","😏","😜","🫡","🙏","👍","👎","👏","🙌","💪",
  "🤝","👋","✌️","🤞","🔥","✨","💯","✅","❌","⚡","⭐","🏆","🎯","💡","💬","📢",
  "❤️","🧡","💛","💚","💙","💜","🖤","🦅","🌍","🇳🇬","🗳️","⏰","📌","📎","📷","📄",
];

export function LiveChat() {
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [showThread, setShowThread] = useState(false);
  const [picker, setPicker] = useState(false);
  const [eligibility, setEligibility] = useState<CallEligibility | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const sendAfterRef = useRef(true);

  const active = convos.find((c) => c.id === activeId) ?? null;

  /* --- initial load --- */
  useEffect(() => {
    let alive = true;
    loadChat().then((res) => {
      if (!alive) return;
      if (!res.available) {
        setState("unavailable");
        return;
      }
      setMembers(res.members);
      setConvos(res.conversations);
      setState("ready");
    });
    return () => { alive = false; };
  }, []);

  const loadThread = useCallback(async (cid: string) => {
    const res = await getMessages(cid);
    if (res.ok) {
      setMessages(res.messages);
      // mark read locally
      setConvos((prev) => prev.map((c) => (c.id === cid ? { ...c, unread: 0 } : c)));
    }
  }, []);

  function openConvo(cid: string) {
    setActiveId(cid);
    setShowThread(true);
    setMessages([]);
    lastCountRef.current = 0;
    loadThread(cid);
  }

  /* --- poll active thread + conversation list (near real-time) --- */
  useEffect(() => {
    if (state !== "ready") return;
    const t = setInterval(async () => {
      if (activeId) {
        const res = await getMessages(activeId);
        if (res.ok) setMessages(res.messages);
      }
      const list = await refreshConversations();
      // keep unread at 0 for the conversation we're viewing
      setConvos(list.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)));
    }, 2500);
    return () => clearInterval(t);
  }, [state, activeId]);

  /* --- auto-scroll on new messages --- */
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
      );
    }
  }, [messages]);

  /* --- call gating: refresh as the conversation grows --- */
  useEffect(() => {
    const otherId = active?.otherId;
    let alive = true;
    (async () => {
      const e = otherId ? await callEligibility(otherId) : null;
      if (alive) setEligibility(e);
    })();
    return () => { alive = false; };
  }, [active?.otherId, messages.length]);

  async function sendPayload(body: string, media?: ChatMedia | null) {
    const text = body.trim();
    if ((!text && !media) || !activeId || sending) return;
    setSending(true);
    if (text) setDraft("");
    setShowEmoji(false);
    // optimistic
    const optimistic: ChatMessageDTO = {
      id: "tmp-" + nowMs(),
      body: text || null,
      mine: true,
      senderName: "You",
      media: media ?? null,
      at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    const res = await sendMessage(activeId, text, media ?? null);
    if (res.ok) {
      if (res.flagged) {
        flashToast("⚠️ Flagged for review — your Ward Captain & LGA Coordinator were notified.");
      }
      await loadThread(activeId);
      const list = await refreshConversations();
      setConvos(list.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)));
    }
    setSending(false);
  }

  const send = () => sendPayload(draft);
  const insertEmoji = (e: string) => setDraft((d) => d + e);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !activeId) return;
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
    if (recording || !activeId) return;
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

  async function beginChat(member: ChatMember) {
    setPicker(false);
    const res = await startDirect(member.id);
    if (res.ok && res.conversationId) {
      const list = await refreshConversations();
      setConvos(list);
      openConvo(res.conversationId);
    }
  }

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  function startCall(mode: "voice" | "video") {
    if (!active?.otherId) return;
    if (eligibility && !eligibility.ok) {
      const remaining = Math.max(0, eligibility.need - eligibility.sentByMe);
      flashToast(
        remaining > 0
          ? `Send ${remaining} more message${remaining === 1 ? "" : "s"} to unlock calling.`
          : `You can call once ${active.title} has replied a little more.`,
      );
      return;
    }
    const detail: StartCallDetail = {
      calleeId: active.otherId,
      name: active.title,
      color: colorFor(active.otherId),
      mode,
    };
    window.dispatchEvent(new CustomEvent("valiant-call:start", { detail }));
  }

  /* ----------------------------- states ----------------------------- */
  if (state === "loading") {
    return (
      <div className="grid h-full place-items-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }
  if (state === "unavailable") {
    return (
      <div className="grid h-full place-items-center bg-white px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-navy)]">Chat is for registered members</h2>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            The demo account can&apos;t message. Register a real account (and have a friend register another)
            to chat end to end — every message is between verified members.
          </p>
        </div>
      </div>
    );
  }

  const filteredConvos = convos.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[75] flex justify-center px-4">
          <div className="max-w-md rounded-2xl bg-[var(--color-navy)] px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
      {picker && (
        <MemberPicker members={members} onPick={beginChat} onClose={() => setPicker(false)} />
      )}

      <div className="flex h-full">
        {/* ===================== Conversation list ===================== */}
        <div className={`flex h-full w-full shrink-0 flex-col border-r border-[var(--color-line)] bg-white md:w-[340px] ${showThread ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-[var(--color-line)] px-4 py-3.5">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">Messages</h1>
              <button
                onClick={() => setPicker(true)}
                title="New chat"
                className="grid size-9 place-items-center rounded-full text-[var(--color-brand-strong)] transition hover:bg-[var(--color-brand-tint)]"
              >
                <PenSquare className="h-5 w-5" />
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats"
                className="h-10 w-full rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-10 pr-4 text-sm outline-none transition focus:border-[var(--color-brand)] focus:bg-white"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Valiant AI pinned */}
            <button
              onClick={() => window.dispatchEvent(new Event("valiant-ai:open"))}
              className="flex w-full items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-brand-tint)]/40 px-3 py-3 text-left transition hover:bg-[var(--color-brand-tint)]"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full gradient-brand text-white">
                <Sparkles className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-[var(--color-ink)]">Valiant AI</div>
                <div className="truncate text-[13px] text-[var(--color-muted)]">Ask me anything · voice &amp; text</div>
              </div>
            </button>

            {filteredConvos.length === 0 && (
              <div className="px-4 py-10 text-center">
                <MessageSquarePlus className="mx-auto mb-2 h-8 w-8 text-[var(--color-faint)]" />
                <p className="text-sm text-[var(--color-muted)]">No conversations yet.</p>
                <button
                  onClick={() => setPicker(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-sm font-bold text-white"
                >
                  <Plus className="h-4 w-4" /> Start a chat
                </button>
              </div>
            )}

            {filteredConvos.map((c) => (
              <button
                key={c.id}
                onClick={() => openConvo(c.id)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                  c.id === activeId ? "bg-[var(--color-brand-tint)]/60" : "hover:bg-[var(--color-surface-2)]"
                }`}
              >
                <Avatar name={c.title} color={c.otherId ? colorFor(c.otherId) : "#7a7068"} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-[var(--color-ink)]">{c.title}</span>
                    <span className={`shrink-0 text-[11px] ${c.unread ? "font-bold text-[var(--color-brand-strong)]" : "text-[var(--color-faint)]"}`}>
                      {dayLabel(c.lastAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-[var(--color-muted)]">
                      {c.lastBody ?? (c.lastHasMedia ? "📎 Attachment" : "Say hello 👋")}
                    </span>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ============================ Thread ============================ */}
        <div
          className={`relative h-full min-w-0 flex-1 flex-col ${showThread ? "flex" : "hidden md:flex"}`}
          style={{ backgroundColor: "#f3ede4" }}
        >
          {!active ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-white/70 text-[var(--color-brand-strong)] shadow-sm">
                  <Sparkles className="h-8 w-8" />
                </div>
                <p className="text-sm font-medium text-[var(--color-muted)]">Select a chat or start a new one</p>
              </div>
            </div>
          ) : (
            <>
              <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(var(--color-ink) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />

              {/* header */}
              <header className="relative z-10 flex items-center gap-3 border-b border-[var(--color-line)] bg-white px-4 py-2.5">
                <button onClick={() => setShowThread(false)} className="grid size-9 place-items-center rounded-full text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)] md:hidden">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Avatar name={active.title} color={active.otherId ? colorFor(active.otherId) : "#7a7068"} size={42} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[15px] font-bold text-[var(--color-ink)]">{active.title}</div>
                  <div className="truncate text-xs text-[var(--color-green)]">verified member</div>
                </div>
                <div className="flex items-center gap-1 text-[var(--color-muted)]">
                  {(() => {
                    const locked = !!eligibility && !eligibility.ok;
                    const lockTitle = `Chat a little more to unlock calling (each of you needs ${eligibility?.need ?? 3} messages)`;
                    return (
                      <>
                        <button
                          onClick={() => startCall("video")}
                          title={locked ? lockTitle : "Video call"}
                          className={`grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)] ${locked ? "opacity-40" : ""}`}
                        >
                          <Video className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          onClick={() => startCall("voice")}
                          title={locked ? lockTitle : "Voice call"}
                          className={`grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)] ${locked ? "opacity-40" : ""}`}
                        >
                          <Phone className="h-[18px] w-[18px]" />
                        </button>
                      </>
                    );
                  })()}
                  <button className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-surface-2)]">
                    <MoreVertical className="h-[18px] w-[18px]" />
                  </button>
                </div>
              </header>

              {/* messages */}
              <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-12">
                <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
                  <div className="mx-auto mb-2 flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1 text-[11px] font-medium text-[var(--color-muted)] shadow-sm backdrop-blur">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-green)]" />
                    Messages are between verified members
                  </div>
                  {messages.length === 0 && (
                    <p className="py-10 text-center text-sm text-[var(--color-muted)]">No messages yet — say hello 👋</p>
                  )}
                  {messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const grouped = prev && prev.mine === m.mine;
                    return (
                      <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                        <div className={`relative flex max-w-[82%] flex-col gap-1 rounded-2xl px-2 py-1.5 text-[14.5px] leading-relaxed shadow-sm ${m.mine ? "rounded-br-md bg-[var(--color-brand-tint)] text-[var(--color-ink)]" : "rounded-bl-md bg-white text-[var(--color-ink)]"}`}>
                          {m.media?.kind === "image" && <ImageMedia media={m.media} />}
                          {m.media?.kind === "audio" && <AudioNote media={m.media} mine={m.mine} />}
                          {m.media?.kind === "file" && <FileCard media={m.media} mine={m.mine} />}
                          {m.body && <span className="whitespace-pre-wrap break-words px-1">{m.body}</span>}
                          <span className="flex items-center gap-0.5 self-end px-1 text-[10px] text-[var(--color-faint)]">
                            {clock(m.at)}
                            {m.mine && (m.id.startsWith("tmp-") ? <Check className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5 text-[#0ea5e9]" />)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* composer */}
              <div className="relative z-10 flex items-end gap-1.5 bg-white px-2.5 py-2.5 md:px-6">
                {showEmoji && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />}
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
                      placeholder="Type a message"
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
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ----------------------------- Member picker ----------------------------- */

function MemberPicker({
  members,
  onPick,
  onClose,
}: {
  members: ChatMember[];
  onPick: (m: ChatMember) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = members.filter(
    (m) => m.name.toLowerCase().includes(q.toLowerCase()) || (m.username ?? "").toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
          <h3 className="flex items-center gap-2 font-bold text-[var(--color-navy)]">
            <UserPlus className="h-5 w-5 text-[var(--color-brand-strong)]" /> New message
          </h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-[var(--color-line)] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search members by name…"
              className="h-10 w-full rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-10 pr-4 text-sm outline-none focus:border-[var(--color-brand)] focus:bg-white"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {list.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--color-muted)]">
              {members.length === 0 ? "No other members have registered yet." : "No members match your search."}
            </p>
          )}
          {list.map((m) => (
            <button
              key={m.id}
              onClick={() => onPick(m)}
              className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-[var(--color-surface-2)]"
            >
              <Avatar name={m.name} color={colorFor(m.id)} size={42} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{m.name}</div>
                <div className="truncate text-xs text-[var(--color-faint)]">
                  {m.username ? "@" + m.username : m.email}
                </div>
              </div>
              <Plus className="h-4 w-4 text-[var(--color-brand-strong)]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ media bubbles ------------------------------ */

function ImageMedia({ media }: { media: ChatMedia }) {
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

function FileCard({ media, mine }: { media: ChatMedia; mine?: boolean }) {
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

function AudioNote({ media, mine }: { media: ChatMedia; mine?: boolean }) {
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

/* ------------------------------ emoji picker ------------------------------ */

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
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
