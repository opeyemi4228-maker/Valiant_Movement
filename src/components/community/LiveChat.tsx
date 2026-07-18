"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Phone,
  Video,
  MoreVertical,
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
  Users,
  PhoneMissed,
  PhoneOff,
  Flag,
  ShieldAlert,
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
import { reportMember, type ReportCategory } from "@/app/actions/reports";
import type { CallEligibility } from "@/lib/demo-store";
import type { StartCallDetail } from "@/components/call/CallCenter";
import { Avatar } from "./Avatar";
import { AudioNote, Composer, FileCard, ImageMedia, clock, colorFor, fmtTime } from "./chat-shared";

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

/** One-line preview for the conversation list, media- and call-aware. */
function previewFor(c: ChatConversation): { text: string; missed: boolean } {
  if (c.lastMedia?.kind === "system") return { text: `👋 ${c.lastBody ?? "New member joined"}`, missed: false };
  if (c.lastBody) return { text: c.lastBody, missed: false };
  const m = c.lastMedia;
  if (!m) return { text: c.type === "group" ? "Say hello to the group 👋" : "Say hello 👋", missed: false };
  if (m.kind === "call") {
    const video = m.callMode === "video";
    const icon = video ? "🎥" : "📞";
    if (m.callStatus === "completed")
      return { text: `${icon} ${video ? "Video" : "Voice"} call · ${fmtTime(m.duration ?? 0)}`, missed: false };
    if (m.callStatus === "declined") return { text: `${icon} Call declined`, missed: false };
    return { text: `${icon} Missed ${video ? "video" : "voice"} call`, missed: true };
  }
  if (m.kind === "audio")
    return { text: `🎤 Voice note${m.duration ? " · " + fmtTime(m.duration) : ""}`, missed: false };
  if (m.kind === "image") return { text: "📷 Photo", missed: false };
  return { text: `📄 ${m.name ?? "Document"}`, missed: false };
}

// Indirected so the timestamp read is clearly a runtime (not render) call.
function nowMs() {
  return Date.now();
}

/** List/header avatar — members get their photo/initials, groups an icon. */
function ConvoAvatar({ c, size }: { c: ChatConversation; size: number }) {
  if (c.type === "group") {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full gradient-brand text-white"
        style={{ width: size, height: size }}
      >
        <Users style={{ width: size * 0.45, height: size * 0.45 }} />
      </span>
    );
  }
  return (
    <Avatar
      name={c.title}
      color={c.otherId ? colorFor(c.otherId) : "#7a7068"}
      photo={c.otherAvatar ?? undefined}
      size={size}
    />
  );
}

export function LiveChat() {
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [query, setQuery] = useState("");
  const [showThread, setShowThread] = useState(false);
  const [picker, setPicker] = useState(false);
  const [eligibility, setEligibility] = useState<CallEligibility | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState<{ id: string; name: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const active = convos.find((c) => c.id === activeId) ?? null;
  const isGroup = active?.type === "group";

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
      setOtherReadAt(res.otherLastReadAt ?? null);
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
      // A failed poll (network blip, server hiccup) keeps the current view;
      // the next tick recovers.
      try {
        if (activeId) {
          const res = await getMessages(activeId);
          if (res.ok) {
            setMessages(res.messages);
            setOtherReadAt(res.otherLastReadAt ?? null);
          }
        }
        const list = await refreshConversations();
        // keep unread at 0 for the conversation we're viewing
        if (list) setConvos(list.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)));
      } catch {
        /* transient — retry on the next tick */
      }
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

  /* --- call gating: refresh as the conversation grows (direct chats only) --- */
  useEffect(() => {
    const otherId = active?.otherId;
    let alive = true;
    (async () => {
      const e = otherId ? await callEligibility(otherId) : null;
      if (alive) setEligibility(e);
    })();
    return () => { alive = false; };
  }, [active?.otherId, messages.length]);

  /* --- send (optimistic; Composer restores the draft on failure) --- */
  const sendPayload = useCallback(
    async (body: string, media?: ChatMedia | null): Promise<{ ok: boolean }> => {
      if (!activeId) return { ok: false };
      const optimistic: ChatMessageDTO = {
        id: "tmp-" + nowMs(),
        body: body || null,
        mine: true,
        senderId: "me",
        senderName: "You",
        senderAvatar: null,
        media: media ?? null,
        at: new Date().toISOString(),
      };
      setMessages((m) => [...m, optimistic]);
      let res: Awaited<ReturnType<typeof sendMessage>>;
      try {
        res = await sendMessage(activeId, body, media ?? null);
      } catch {
        res = { ok: false, error: "Couldn't reach the server — check your connection and try again." };
      }
      if (res.ok) {
        if (res.flagged) {
          flashToast("⚠️ Flagged for review — your Ward Captain & LGA Coordinator were notified.");
        }
        await loadThread(activeId);
        const list = await refreshConversations();
        if (list) setConvos(list.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)));
        return { ok: true };
      }
      // Roll back the optimistic bubble.
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      flashToast(res.error && res.error.length > 12 ? res.error : "Message didn't send — please try again.");
      return { ok: false };
    },
    [activeId, loadThread],
  );

  async function beginChat(member: ChatMember) {
    setPicker(false);
    const res = await startDirect(member.id);
    if (res.ok && res.conversationId) {
      const list = await refreshConversations();
      if (list) setConvos(list);
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
      {reporting && (
        <ReportMemberModal
          member={reporting}
          onClose={() => setReporting(null)}
          onDone={(msg) => {
            setReporting(null);
            flashToast(msg);
          }}
        />
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
                <ConvoAvatar c={c} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold text-[var(--color-ink)]">{c.title}</span>
                    <span className={`shrink-0 text-[11px] ${c.unread ? "font-bold text-[var(--color-brand-strong)]" : "text-[var(--color-faint)]"}`}>
                      {dayLabel(c.lastAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {(() => {
                      const p = previewFor(c);
                      const alert = p.missed && c.unread > 0;
                      return (
                        <span className={`truncate text-[13px] ${alert ? "font-semibold text-[var(--color-danger)]" : "text-[var(--color-muted)]"}`}>
                          {p.text}
                        </span>
                      );
                    })()}
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
                <ConvoAvatar c={active} size={42} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[15px] font-bold text-[var(--color-ink)]">{active.title}</div>
                  <div className="truncate text-xs text-[var(--color-green)]">
                    {isGroup ? "community group · all members verified" : "verified member"}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[var(--color-muted)]">
                  {!isGroup && (() => {
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
                  {!isGroup && (
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen((v) => !v)}
                        aria-label="Conversation options"
                        className={`grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-surface-2)] ${menuOpen ? "bg-[var(--color-surface-2)]" : ""}`}
                      >
                        <MoreVertical className="h-[18px] w-[18px]" />
                      </button>
                      {menuOpen && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                          <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white py-1 shadow-xl">
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                if (active.otherId) setReporting({ id: active.otherId, name: active.title });
                              }}
                              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/5"
                            >
                              <Flag className="h-4 w-4" /> Report {active.title.split(/\s+/)[0]}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </header>

              {/* messages — bottom-anchored: a sparse thread hugs the composer
                  (like WhatsApp) instead of floating in empty canvas */}
              <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-12">
                <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-end gap-1.5">
                  <div className="mx-auto mb-2 flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1 text-[11px] font-medium text-[var(--color-muted)] shadow-sm backdrop-blur">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-green)]" />
                    {isGroup ? "Every member of this group is NIN-verified" : "Messages are between verified members"}
                  </div>
                  {messages.length === 0 && (
                    <p className="py-10 text-center text-sm text-[var(--color-muted)]">No messages yet — say hello 👋</p>
                  )}
                  {messages.map((m, i) => {
                    if (m.media?.kind === "system") {
                      return (
                        <div key={m.id} className="mt-2 flex justify-center">
                          <span className="rounded-full bg-white/80 px-3 py-1 text-[11.5px] font-medium text-[var(--color-muted)] shadow-sm backdrop-blur">
                            👋 {m.body}
                          </span>
                        </div>
                      );
                    }
                    if (m.media?.kind === "call") {
                      const callMedia = m.media;
                      return (
                        <CallEventRow
                          key={m.id}
                          media={callMedia}
                          mine={m.mine}
                          at={m.at}
                          onCallBack={() => startCall(callMedia.callMode ?? "voice")}
                        />
                      );
                    }
                    const prev = messages[i - 1];
                    const grouped =
                      !!prev && prev.senderId === m.senderId && !prev.media?.callStatus && prev.media?.kind !== "system";
                    // ticks: ✓ sending · ✓✓ delivered · blue ✓✓ read
                    const read = !!otherReadAt && m.at <= otherReadAt;
                    return (
                      <div key={m.id} className={`flex items-end gap-2 ${m.mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                        {isGroup && !m.mine && (
                          <span className={grouped ? "invisible" : ""}>
                            <Avatar name={m.senderName} color={colorFor(m.senderId)} photo={m.senderAvatar ?? undefined} size={30} />
                          </span>
                        )}
                        <div className={`relative flex max-w-[82%] flex-col gap-1 rounded-2xl px-2 py-1.5 text-[14.5px] leading-relaxed shadow-sm ${m.mine ? "rounded-br-md bg-[var(--color-brand-tint)] text-[var(--color-ink)]" : "rounded-bl-md bg-white text-[var(--color-ink)]"}`}>
                          {isGroup && !m.mine && !grouped && (
                            <span className="px-1 pt-0.5 text-[12.5px] font-bold" style={{ color: colorFor(m.senderId) }}>
                              {m.senderName}
                            </span>
                          )}
                          {m.media?.kind === "image" && <ImageMedia media={m.media} />}
                          {m.media?.kind === "audio" && <AudioNote media={m.media} mine={m.mine} />}
                          {m.media?.kind === "file" && <FileCard media={m.media} mine={m.mine} />}
                          {m.body && <span className="whitespace-pre-wrap break-words px-1">{m.body}</span>}
                          <span className="flex items-center gap-0.5 self-end px-1 text-[10px] text-[var(--color-faint)]">
                            {clock(m.at)}
                            {m.mine &&
                              (m.id.startsWith("tmp-") ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <CheckCheck className={`h-3.5 w-3.5 ${read ? "text-[#0ea5e9]" : ""}`} />
                              ))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* composer — shared with the community group chat */}
              <Composer
                onSend={sendPayload}
                placeholder={isGroup ? `Message ${active.title}` : "Type a message"}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------------------- Report a member ---------------------------- */

const REPORT_REASONS: { key: ReportCategory; label: string; hint: string }[] = [
  { key: "harassment", label: "Harassment or bullying", hint: "Targeted insults, threats or intimidation" },
  { key: "spam", label: "Spam or scam", hint: "Unwanted promotions, fraud or phishing" },
  { key: "impersonation", label: "Impersonation", hint: "Pretending to be someone else or a fake identity" },
  { key: "hate", label: "Hate speech", hint: "Attacks based on ethnicity, religion or identity" },
  { key: "violence", label: "Violence or dangerous acts", hint: "Threats, incitement or glorifying harm" },
  { key: "other", label: "Something else", hint: "Anything that doesn't fit the above" },
];

function ReportMemberModal({
  member,
  onClose,
  onDone,
}: {
  member: { id: string; name: string };
  onClose: () => void;
  onDone: (toast: string) => void;
}) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!category || submitting) return;
    setSubmitting(true);
    setError(null);
    let res: Awaited<ReturnType<typeof reportMember>>;
    try {
      res = await reportMember(member.id, category, details);
    } catch {
      res = { ok: false, error: "Couldn't reach the server — please try again." };
    }
    setSubmitting(false);
    if (res.ok) {
      onDone("✅ Report submitted — our moderation team will review it.");
    } else {
      setError(res.error ?? "Couldn't submit the report — please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] p-4">
          <h3 className="flex items-center gap-2 font-bold text-[var(--color-navy)]">
            <ShieldAlert className="h-5 w-5 text-[var(--color-danger)]" /> Report {member.name}
          </h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          <p className="px-1 pb-2 text-[13px] text-[var(--color-muted)]">
            Your report is confidential — {member.name.split(/\s+/)[0]} won&apos;t know who reported them.
          </p>
          {REPORT_REASONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setCategory(r.key)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                category === r.key
                  ? "border-[var(--color-danger)] bg-[var(--color-danger)]/5"
                  : "border-[var(--color-line)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <span
                className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                  category === r.key ? "border-[var(--color-danger)]" : "border-[var(--color-faint)]"
                }`}
              >
                {category === r.key && <span className="size-2 rounded-full bg-[var(--color-danger)]" />}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold text-[var(--color-ink)]">{r.label}</span>
                <span className="block text-xs text-[var(--color-muted)]">{r.hint}</span>
              </span>
            </button>
          ))}
          <div className="pt-2">
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Add details that will help our team (optional)"
              className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--color-brand)] focus:bg-white"
            />
          </div>
          {error && <p className="px-1 text-sm font-medium text-[var(--color-danger)]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] p-4">
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--color-line)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!category || submitting}
            className="flex items-center gap-2 rounded-full bg-[var(--color-danger)] px-5 py-2 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
            Submit report
          </button>
        </div>
      </div>
    </div>
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
              <Avatar name={m.name} color={colorFor(m.id)} photo={m.avatar ?? undefined} size={42} />
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

/* ------------------------------ call events ------------------------------ */

/** An entry in the thread's call log — missed / declined / completed call.
 *  Tapping it calls the member back in the same mode. */
function CallEventRow({
  media,
  mine,
  at,
  onCallBack,
}: {
  media: ChatMedia;
  mine: boolean;
  at: string;
  onCallBack: () => void;
}) {
  const video = media.callMode === "video";
  const missed = media.callStatus === "missed";
  const declined = media.callStatus === "declined";
  const label =
    media.callStatus === "completed"
      ? `${video ? "Video" : "Voice"} call`
      : missed
        ? mine
          ? "No answer"
          : `Missed ${video ? "video" : "voice"} call`
        : mine
          ? "Call declined"
          : `Declined ${video ? "video" : "voice"} call`;
  const Icon = missed ? PhoneMissed : declined ? PhoneOff : video ? Video : Phone;
  const alert = missed && !mine; // the callee's missed call is the loud one
  return (
    <div className={`mt-2 flex ${mine ? "justify-end" : "justify-start"}`}>
      <button
        onClick={onCallBack}
        title="Call back"
        className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-left shadow-sm transition hover:brightness-95 ${
          mine ? "rounded-br-md bg-[var(--color-brand-tint)]" : "rounded-bl-md bg-white"
        }`}
      >
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full ${
            alert
              ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
              : "bg-[var(--color-surface-2)] text-[var(--color-ink-soft)]"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className={`text-[13.5px] font-semibold ${alert ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}>
            {label}
          </span>
          <span className="text-[11px] text-[var(--color-faint)]">
            {media.callStatus === "completed" && media.duration ? `${fmtTime(media.duration)} · ` : ""}
            {clock(at)} · tap to call back
          </span>
        </span>
      </button>
    </div>
  );
}
