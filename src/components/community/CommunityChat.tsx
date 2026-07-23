"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, Loader2, Phone, Radio, ShieldCheck, Users, Video } from "lucide-react";
import { getMessages, sendMessage, type ChatMessageDTO } from "@/app/actions/chat";
import { openCommunityChat } from "@/app/actions/communities";
import { getActiveHuddle, startCommunityHuddle } from "@/app/actions/huddle";
import { HuddleRoom } from "@/components/call/HuddleRoom";
import type { CommunityDTO } from "@/lib/communities";
import { Avatar } from "./Avatar";
import { AudioNote, CallEventRow, Composer, FileCard, ImageMedia, clock, colorFor } from "./chat-shared";

/* ============================================================
   Community group chat — WhatsApp-style. Every member of the
   community shares one group conversation; messages carry the
   sender's name, colour and photo. Same feature set as the 1:1
   Messages dashboard (text, emoji, attachments, voice notes)
   via the shared Composer.
   ============================================================ */

// Indirected so the timestamp read is clearly a runtime (not render) call.
function nowMs() {
  return Date.now();
}

interface ChatCacheEntry {
  conversationId: string;
  memberCount: number;
  messages: ChatMessageDTO[];
  otherReadAt: string | null;
  otherOnline: boolean;
}

export function CommunityChat({
  community,
  onBack,
  onShowMembers,
}: {
  community: CommunityDTO;
  onBack: () => void;
  onShowMembers: () => void;
}) {
  const [state, setState] = useState<"joining" | "ready" | "error">("joining");
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(community.memberCount);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [otherOnline, setOtherOnline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [huddle, setHuddle] = useState<{ huddleId: string; meId: string; mode: "voice" | "video" } | null>(null);
  const [liveHuddle, setLiveHuddle] = useState<{ huddleId: string; mode: string; count: number } | null>(null);
  const [joining, setJoining] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  // Every getMessages fetch (initial load, confirm-send reload, background
  // poll) is tagged with a sequence number so a stale in-flight response
  // (e.g. a poll issued just before a send, resolving just after) can never
  // overwrite the freshly-sent message with the pre-send list — that race
  // was what made a just-sent message flash and then briefly disappear.
  const msgSeqRef = useRef(0);
  // While a send's own round trip is in flight (including its confirm
  // reload), the background poll must not touch `messages` at all — even
  // its NEWEST request can race the insert at the database layer and read
  // a snapshot from just before the send committed, which the sequence
  // guard above can't catch on its own (that response isn't stale, it's
  // just early). Blanking this window out is what stops a sent message
  // from flashing away and reappearing a poll cycle later.
  const sendingRef = useRef(0);
  // Per-community cache: this component is now kept mounted across group
  // switches (Communities.tsx no longer key-remounts it), so a plain ref
  // persists across `community.id` prop changes. Switching back to a group
  // you've already opened this session shows its cached messages instantly
  // instead of a fresh "joining…" spinner — same pattern as the Messages cache.
  const chatCacheRef = useRef<Map<string, ChatCacheEntry>>(new Map());

  /* --- join the group + first load --- */
  useEffect(() => {
    let alive = true;

    const cached = chatCacheRef.current.get(community.id);
    if (cached) {
      // Show what we already have instantly; the fetch below reconciles it.
      setConversationId(cached.conversationId);
      setMemberCount(cached.memberCount);
      setMessages(cached.messages);
      setOtherReadAt(cached.otherReadAt);
      setOtherOnline(cached.otherOnline);
      setState("ready");
    } else {
      setState("joining");
      setConversationId(null);
      setMessages([]);
      setOtherReadAt(null);
      setOtherOnline(false);
      setMemberCount(community.memberCount);
    }
    setError(null);

    // Retries on top of the server's own retry — a transient failure (or a
    // rejected promise with no .catch()) previously left `state` stuck on
    // "joining…" forever, since nothing else ever flips it.
    const attempt = (n: number) => {
      openCommunityChat(community.id)
        .then((res) => {
          if (!alive) return;
          if (res.transient && n < 6) {
            setTimeout(() => { if (alive) attempt(n + 1); }, Math.min(800 * (n + 1), 4000));
            return;
          }
          if (!res.ok || !res.chat) {
            if (!cached) {
              setError(res.error ?? "Couldn't open this community's chat.");
              setState("error");
            }
            return;
          }
          const { conversationId: cid, memberCount: mc } = res.chat;
          setConversationId(cid);
          setMemberCount(mc);
          setState("ready");
          const seq = ++msgSeqRef.current;
          getMessages(cid).then((m) => {
            if (!alive || !m.ok || seq !== msgSeqRef.current) return;
            setMessages(m.messages);
            setOtherReadAt(m.otherLastReadAt ?? null);
            setOtherOnline(m.otherOnline ?? false);
            chatCacheRef.current.set(community.id, {
              conversationId: cid,
              memberCount: mc,
              messages: m.messages,
              otherReadAt: m.otherLastReadAt ?? null,
              otherOnline: m.otherOnline ?? false,
            });
          });
        })
        .catch(() => {
          if (!alive) return;
          if (n < 6) setTimeout(() => { if (alive) attempt(n + 1); }, Math.min(800 * (n + 1), 4000));
        });
    };
    attempt(0);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [community.id]);

  /* --- poll the thread + live-huddle banner (near real-time) --- */
  useEffect(() => {
    if (state !== "ready" || !conversationId) return;
    let inFlight = false; // skip a tick rather than let slow polls pile up
    const t = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      const seq = ++msgSeqRef.current;
      // A failed poll keeps the current view; the next tick recovers.
      try {
        const [res, live] = await Promise.all([getMessages(conversationId), getActiveHuddle(community.id)]);
        // Drop this response if a newer fetch (e.g. the confirm-send reload)
        // has been issued since, or if a send is currently mid-flight — see
        // msgSeqRef / sendingRef above.
        if (res.ok && seq === msgSeqRef.current && sendingRef.current === 0) {
          setMessages(res.messages);
          setOtherReadAt(res.otherLastReadAt ?? null);
          setOtherOnline(res.otherOnline ?? false);
          chatCacheRef.current.set(community.id, {
            conversationId,
            memberCount,
            messages: res.messages,
            otherReadAt: res.otherLastReadAt ?? null,
            otherOnline: res.otherOnline ?? false,
          });
        }
        setLiveHuddle(live);
      } catch {
        /* transient — retry on the next tick */
      } finally {
        inFlight = false;
      }
    }, 200); // tightened again — as fast as this architecture allows
    return () => clearInterval(t);
  }, [state, conversationId, community.id, memberCount]);

  /* --- start or join the community huddle (group call for everyone) --- */
  async function openHuddle(mode: "voice" | "video") {
    if (joining || huddle) return;
    setJoining(true);
    let res: Awaited<ReturnType<typeof startCommunityHuddle>>;
    try {
      res = await startCommunityHuddle(community.id, mode);
    } catch {
      res = { ok: false, error: "Couldn't reach the server — please try again." };
    }
    setJoining(false);
    if (res.ok && res.huddleId && res.meId) {
      setHuddle({ huddleId: res.huddleId, meId: res.meId, mode: (res.mode as "voice" | "video") ?? mode });
    } else {
      setToast(res.error ?? "Couldn't start the huddle — please try again.");
      setTimeout(() => setToast(null), 3200);
    }
  }

  /* --- auto-scroll on new messages --- */
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
      );
    }
  }, [messages]);

  const send = useCallback(
    async (body: string, media?: import("@/app/actions/chat").ChatMedia | null) => {
      if (!conversationId) return { ok: false };
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
      sendingRef.current++;
      try {
        let res: Awaited<ReturnType<typeof sendMessage>>;
        try {
          res = await sendMessage(conversationId, body, media ?? null);
        } catch {
          res = { ok: false, error: "network" };
        }
        if (res.ok) {
          if (res.flagged) {
            setToast("⚠️ Flagged for review — your Ward Captain & LGA Coordinator were notified.");
            setTimeout(() => setToast(null), 3200);
          }
          const seq = ++msgSeqRef.current;
          const fresh = await getMessages(conversationId);
          if (fresh.ok && seq === msgSeqRef.current) {
            setMessages(fresh.messages);
            setOtherReadAt(fresh.otherLastReadAt ?? null);
            setOtherOnline(fresh.otherOnline ?? false);
            chatCacheRef.current.set(community.id, {
              conversationId,
              memberCount,
              messages: fresh.messages,
              otherReadAt: fresh.otherLastReadAt ?? null,
              otherOnline: fresh.otherOnline ?? false,
            });
          }
          return { ok: true };
        }
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setToast(res.error && res.error.length > 12 ? res.error : "Message didn't send — please try again.");
        setTimeout(() => setToast(null), 3200);
        return { ok: false };
      } finally {
        sendingRef.current = Math.max(0, sendingRef.current - 1);
      }
    },
    [conversationId, community.id, memberCount],
  );

  if (state === "joining") {
    return (
      <div className="grid h-full place-items-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="grid h-full place-items-center bg-white px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]">
            <Users className="h-7 w-7" />
          </div>
          <p className="text-sm text-[var(--color-muted)]">{error}</p>
          <button
            onClick={onBack}
            className="mt-4 rounded-full border border-[var(--color-line)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)]"
          >
            Back to communities
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col" style={{ backgroundColor: "#f3ede4" }}>
      {huddle && (
        <HuddleRoom
          huddleId={huddle.huddleId}
          meId={huddle.meId}
          mode={huddle.mode}
          title={community.name}
          onClose={() => setHuddle(null)}
        />
      )}
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[75] flex justify-center px-4">
          <div className="max-w-md rounded-2xl bg-[var(--color-navy)] px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(var(--color-ink) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />

      {/* header */}
      <header className="relative z-10 flex items-center gap-3 border-b border-[var(--color-line)] bg-white px-4 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back to communities"
          className="grid size-9 place-items-center rounded-full text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)] md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand text-white">
          <Users className="h-5 w-5" />
        </span>
        <button onClick={onShowMembers} className="min-w-0 flex-1 text-left leading-tight" title="View members">
          <div className="truncate text-[15px] font-bold text-[var(--color-ink)]">{community.name}</div>
          <div className="truncate text-xs text-[var(--color-muted)]">
            {memberCount} member{memberCount === 1 ? "" : "s"} · tap for member list
          </div>
        </button>
        {/* group call — a huddle every member of the community can join */}
        <div className="flex items-center gap-1 text-[var(--color-muted)]">
          <button
            onClick={() => openHuddle("video")}
            disabled={joining}
            title="Start a video huddle — everyone in this community can join"
            aria-label="Start a video huddle"
            className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)] disabled:opacity-50"
          >
            <Video className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={() => openHuddle("voice")}
            disabled={joining}
            title="Start a voice huddle — everyone in this community can join"
            aria-label="Start a voice huddle"
            className="grid size-9 place-items-center rounded-full transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)] disabled:opacity-50"
          >
            <Phone className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      {/* live huddle banner — join with one tap */}
      {liveHuddle && !huddle && (
        <button
          onClick={() => openHuddle(liveHuddle.mode === "video" ? "video" : "voice")}
          disabled={joining}
          className="relative z-10 flex items-center gap-2.5 border-b border-[var(--color-green)]/30 bg-[var(--color-green)]/10 px-4 py-2.5 text-left transition hover:bg-[var(--color-green)]/15 disabled:opacity-70"
        >
          <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-green)] text-white">
            <Radio className="h-4 w-4" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-green)]/50" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-sm font-bold text-[var(--color-green)]">
              {liveHuddle.mode === "video" ? "Video" : "Voice"} huddle live now
            </span>
            <span className="block text-xs text-[var(--color-muted)]">
              {liveHuddle.count} member{liveHuddle.count === 1 ? "" : "s"} in the room · tap to join
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-green)] px-4 py-1.5 text-xs font-bold text-white">
            {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {joining ? "Joining…" : "Join"}
          </span>
        </button>
      )}

      {/* messages — bottom-anchored: a sparse thread hugs the composer
          (like WhatsApp) instead of floating in empty canvas */}
      <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-12">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-end gap-1.5">
          <div className="mx-auto mb-2 flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1 text-[11px] font-medium text-[var(--color-muted)] shadow-sm backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-green)]" />
            Every member here is NIN-verified · run by {community.controlledBy}
          </div>
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--color-muted)]">
              No messages yet — be the first to greet your community 👋
            </p>
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
                  onCallBack={() => openHuddle(callMedia.callMode ?? "voice")}
                />
              );
            }
            const prev = messages[i - 1];
            const grouped =
              !!prev && prev.senderId === m.senderId && prev.media?.kind !== "system" && prev.media?.kind !== "call";
            const read = !!otherReadAt && m.at <= otherReadAt;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${m.mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}>
                {!m.mine && (
                  <span className={grouped ? "invisible" : ""}>
                    <Avatar
                      name={m.senderName}
                      color={colorFor(m.senderId)}
                      photo={m.senderAvatar ?? undefined}
                      size={30}
                    />
                  </span>
                )}
                <div className={`relative flex max-w-[78%] flex-col gap-1 rounded-2xl px-2 py-1.5 text-[14.5px] leading-relaxed shadow-sm ${m.mine ? "rounded-br-md bg-[var(--color-brand-tint)] text-[var(--color-ink)]" : "rounded-bl-md bg-white text-[var(--color-ink)]"}`}>
                  {!m.mine && !grouped && (
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
                      ) : read ? (
                        <CheckCheck className="h-3.5 w-3.5 text-[#0ea5e9]" />
                      ) : otherOnline ? (
                        <CheckCheck className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      ))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* composer — same features as the Messages dashboard */}
      <Composer onSend={send} placeholder={`Message ${community.name}`} />
    </div>
  );
}
