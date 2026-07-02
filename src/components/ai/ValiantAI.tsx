"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Mic,
  Paperclip,
  Volume2,
  VolumeX,
  X,
  FileText,
  Square,
} from "lucide-react";
import {
  AI_GREETING,
  WAKE_GREETING,
  QUICK_PROMPTS,
  valiantReply,
  acknowledgeAttachment,
} from "./replies";
import { getSRCtor, speak, stopSpeaking, type SREvent, type SpeechRecognitionLike } from "./speech";

interface AIMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  image?: string;
  file?: { name: string; size: string };
}

function bytes(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " MB";
  if (n >= 1_000) return Math.round(n / 1_000) + " KB";
  return n + " B";
}

let uid = 0;
const nid = () => `ai-${Date.now()}-${uid++}`;

export function ValiantAI({ onClose, wakeGreeting = false }: { onClose: () => void; wakeGreeting?: boolean }) {
  const [messages, setMessages] = useState<AIMessage[]>([
    { id: nid(), role: "ai", text: AI_GREETING },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceOnRef = useRef(voiceOn);
  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  const scrollDown = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

  function say(text: string) {
    if (!voiceOnRef.current) return;
    speak(text, () => setSpeaking(true), () => setSpeaking(false));
  }

  function respond(toUserText: string, opts?: { attachmentName?: string; isImage?: boolean }) {
    setThinking(true);
    const reply = opts?.attachmentName
      ? acknowledgeAttachment(opts.attachmentName, !!opts.isImage)
      : valiantReply(toUserText);
    const delay = 500 + Math.min(1400, reply.length * 8);
    setTimeout(() => {
      setMessages((m) => [...m, { id: nid(), role: "ai", text: reply }]);
      setThinking(false);
      say(reply);
      scrollDown();
    }, delay);
  }

  function sendText(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text) return;
    stopSpeaking();
    setMessages((m) => [...m, { id: nid(), role: "user", text }]);
    setInput("");
    scrollDown();
    respond(text);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const isImage = f.type.startsWith("image/");
    const msg: AIMessage = isImage
      ? { id: nid(), role: "user", text: "", image: URL.createObjectURL(f) }
      : { id: nid(), role: "user", text: "", file: { name: f.name, size: bytes(f.size) } };
    setMessages((m) => [...m, msg]);
    scrollDown();
    respond("", { attachmentName: f.name, isImage });
  }

  // --- voice input (one-shot speech-to-text) ---
  function toggleMic() {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const Ctor = getSRCtor();
    if (!Ctor) return;
    stopSpeaking();
    const recog = new Ctor();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = "en-US";
    let finalText = "";
    recog.onresult = (e: SREvent) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    recog.onend = () => {
      setListening(false);
      setInterim("");
      recogRef.current = null;
      const t = finalText.trim();
      if (t) sendText(t);
    };
    recog.onerror = () => {
      setListening(false);
      setInterim("");
      recogRef.current = null;
    };
    recogRef.current = recog;
    setListening(true);
    try { recog.start(); } catch { setListening(false); }
  }

  // greet by voice when opened via the wake word
  useEffect(() => {
    if (wakeGreeting) {
      const t = setTimeout(() => say(WAKE_GREETING), 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { stopSpeaking(); recogRef.current?.abort?.(); }, []);

  function toggleVoice() {
    setVoiceOn((v) => {
      if (v) stopSpeaking();
      return !v;
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Header */}
      <header className="flex items-center gap-3 bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-2)] px-4 py-3 text-white">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/30">
          <Sparkles className="h-5 w-5" />
          {speaking && <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5 font-bold">Valiant AI</div>
          <div className="text-[11px] text-white/80">
            {speaking ? "Speaking…" : listening ? "Listening…" : thinking ? "Thinking…" : "Online · voice + text"}
          </div>
        </div>
        <button onClick={toggleVoice} title={voiceOn ? "Mute voice" : "Unmute voice"} className="grid size-9 place-items-center rounded-full transition hover:bg-white/20">
          {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        <button onClick={onClose} title="Close" className="grid size-9 place-items-center rounded-full transition hover:bg-white/20">
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--color-bg)] px-3 py-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "ai" && (
              <span className="mr-2 mt-0.5 grid size-7 shrink-0 place-items-center self-end rounded-full gradient-brand text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "rounded-br-md bg-[var(--color-brand-tint)] text-[var(--color-ink)]"
                  : "rounded-bl-md bg-white text-[var(--color-ink-soft)]"
              }`}
            >
              {m.image && <img src={m.image} alt="" className="mb-1.5 max-h-52 rounded-xl object-cover" />}
              {m.file && (
                <span className="mb-1 flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-brand)] text-white">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[13px] font-semibold text-[var(--color-ink)]">{m.file.name}</span>
                    <span className="block text-[11px] text-[var(--color-faint)]">{m.file.size}</span>
                  </span>
                </span>
              )}
              {m.text && <span className="whitespace-pre-wrap">{m.text}</span>}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <span className="mr-2 grid size-7 shrink-0 place-items-center self-end rounded-full gradient-brand text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 animate-bounce rounded-full bg-[var(--color-faint)]" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Quick prompts (only before the user has said anything) */}
        {messages.length === 1 && !thinking && (
          <div className="flex flex-wrap gap-2 pt-1">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendText(p)}
                className="rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] transition hover:border-[var(--color-brand)] hover:text-[var(--color-brand-strong)]"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--color-line)] bg-white px-3 py-2.5">
        {listening && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-[var(--color-brand-tint)] px-3 py-2 text-[13px] text-[var(--color-brand-strong)]">
            <span className="size-2 animate-pulse rounded-full bg-[var(--color-danger)]" />
            <span className="truncate">{interim || "Listening… speak now"}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
            aria-label="Attach"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input ref={fileRef} type="file" hidden onChange={onPickFile} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
            rows={1}
            placeholder="Ask Valiant AI…"
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 text-[14px] outline-none transition focus:border-[var(--color-brand)] focus:bg-white"
          />
          <button
            onClick={toggleMic}
            className={`grid size-10 shrink-0 place-items-center rounded-full transition ${
              listening ? "bg-[var(--color-danger)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
            }`}
            aria-label={listening ? "Stop" : "Speak"}
          >
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            onClick={() => sendText()}
            disabled={!input.trim()}
            className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand text-white shadow-sm transition enabled:hover:opacity-95 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[var(--color-faint)]">
          Say “Hey Valiant AI” to wake me · I can use voice, text & attachments
        </p>
      </div>
    </div>
  );
}
