"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Volume2,
  VolumeX,
  ScreenShare,
  Users,
  FileText,
  Circle,
  ShieldCheck,
  X,
  Download,
  Captions,
  Loader2,
  Hand,
  MoreHorizontal,
} from "lucide-react";
import { sendOffer, sendAnswer, sendIce, getSignal } from "@/app/actions/realtime";

/* ----------------------- Web Speech API typings ----------------------- */

interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SRCtor = new () => SpeechRecognitionLike;

function getSRCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ------------------------------- types ------------------------------- */

export interface CallParticipant {
  name: string;
  color?: string;
  photo?: string;
  role?: string;
}

export interface CallConfig {
  mode: "voice" | "video";
  kind?: "call" | "meeting";
  title: string;
  subtitle?: string;
  participants?: CallParticipant[];
  /** Present for real 1:1 peer calls — enables WebRTC video/audio between members. */
  callId?: string;
  role?: "caller" | "callee";
}

interface TranscriptLine {
  id: string;
  speaker: string;
  self: boolean;
  text: string;
  at: string;
}

function clock() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/* ------------------------------- CallRoom ------------------------------- */

export function CallRoom({ config, onClose }: { config: CallConfig; onClose: () => void }) {
  const isVideo = config.mode === "video";
  const isMeeting = config.kind === "meeting";
  const participants = useMemo(
    () => (config.participants?.length ? config.participants : [{ name: config.title, color: "#e07400" }]),
    [config],
  );
  // Real 1:1 peer call (WebRTC) vs. local/simulated meeting view.
  const isPeer = !!(config.callId && config.role);

  const [status, setStatus] = useState<"connecting" | "live" | "ended">("connecting");
  const [reconnecting, setReconnecting] = useState(false); // was live, network dropped
  const [connectTrouble, setConnectTrouble] = useState(false); // never connected after a while
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(isVideo);
  const [handRaised, setHandRaised] = useState(false);
  const [showTranscript, setShowTranscript] = useState(isMeeting);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [interim, setInterim] = useState("");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [srSupported] = useState(() => typeof window !== "undefined" && getSRCtor() !== null);
  const [micDenied, setMicDenied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const shareRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }

  /* ---- media: real camera + mic (meeting / simulated view only) ---- */
  useEffect(() => {
    if (isPeer) return; // peer calls manage their own media in the WebRTC effect
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideo,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current && isVideo) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setMediaError(isVideo ? "Camera & microphone unavailable" : "Microphone unavailable");
      }
    }
    start();
    const t = setTimeout(() => !cancelled && setStatus("live"), 1600);
    return () => {
      cancelled = true;
      clearTimeout(t);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [isVideo, isPeer]);

  /* ---- WebRTC: real peer-to-peer audio/video for 1:1 member calls ---- */
  useEffect(() => {
    if (!isPeer) return;
    const callId = config.callId!;
    const role = config.role!;
    let alive = true;
    // Versioned SDP (compare by string) so an ICE-restart re-offer/answer is
    // detected and re-applied — this is what lets a call survive a network
    // change (e.g. WiFi → cellular) instead of freezing.
    let lastOfferApplied = "";
    let lastAnswerApplied = "";
    let tracksAdded = false;
    let restarting = false;
    let iceCallerIdx = 0;
    let iceCalleeIdx = 0;
    let pollDelay = 300; // fast while connecting; ramps down once connected
    let troubleTimer: ReturnType<typeof setTimeout> | null = null;

    // STUN discovers your public address; TURN relays media when a direct path
    // is blocked by NAT/firewalls (essential for calls across different
    // networks). Override with NEXT_PUBLIC_TURN_URL/USERNAME/CREDENTIAL in
    // production; otherwise a free public TURN keeps calls connecting.
    const iceServers: RTCIceServer[] = [
      { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ];
    const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
    if (turnUrl) {
      iceServers.push({
        urls: turnUrl.split(",").map((u) => u.trim()),
        username: process.env.NEXT_PUBLIC_TURN_USERNAME,
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
      });
    } else {
      iceServers.push(
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
      );
    }
    // iceCandidatePoolSize pre-gathers candidates so they're ready the moment
    // the offer/answer is set — shaves time off the connection.
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) sendIce(callId, role, JSON.stringify(e.candidate)).catch(() => {});
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (remoteVideoRef.current && stream) remoteVideoRef.current.srcObject = stream;
      if (e.track.kind === "video") {
        const update = () => alive && setRemoteHasVideo(!e.track.muted);
        update();
        e.track.onmute = update;
        e.track.onunmute = update;
        e.track.onended = () => alive && setRemoteHasVideo(false);
      }
      if (alive) setStatus("live");
    };
    pc.onconnectionstatechange = async () => {
      if (!alive) return;
      const st = pc.connectionState;
      if (st === "connected") {
        setStatus("live");
        setReconnecting(false);
        setConnectTrouble(false);
        if (troubleTimer) { clearTimeout(troubleTimer); troubleTimer = null; }
        pollDelay = 2500; // media is flowing — slow the poll to a trickle
      } else if (st === "failed" || st === "disconnected") {
        setReconnecting(true);
        pollDelay = 300; // speed the poll back up to recover fast
        // The caller drives recovery with an ICE-restart offer; the callee
        // re-answers when it sees the new offer (versioned SDP above).
        if (role === "caller" && !restarting) {
          restarting = true;
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            await sendOffer(callId, JSON.stringify(offer));
          } catch { /* ignore */ }
          restarting = false;
        }
      }
    };
    // If nothing connects within 30s, tell the user (usually a TURN/network
    // issue) instead of spinning on "Connecting…" forever.
    troubleTimer = setTimeout(() => { if (alive) setConnectTrouble(true); }, 30_000);

    const gUM = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c);

    // The callee must not answer until its own mic/camera is ready, otherwise
    // it answers with no tracks and the caller hears/sees nothing.
    let localReady = false;

    (async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await gUM({ video: isVideo, audio: true });
      } catch {
        // The camera may be busy (e.g. a second browser on the same machine) —
        // fall back to audio-only so the call still connects.
        try {
          stream = await gUM({ video: false, audio: true });
          if (alive && isVideo) setMediaError("Camera unavailable — audio only");
        } catch {
          if (alive) setMediaError(isVideo ? "Camera & microphone unavailable" : "Microphone unavailable");
        }
      }
      if (!alive) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream) {
        streamRef.current = stream;
        camTrackRef.current = stream.getVideoTracks()[0] ?? null;
        if (videoRef.current && stream.getVideoTracks().length) videoRef.current.srcObject = stream;
      }
      if (isVideo && (!stream || stream.getVideoTracks().length === 0)) setCamOn(false);

      // The CALLER attaches its tracks and makes the offer now. The CALLEE
      // defers attaching its tracks until after it applies the offer (below),
      // so both sides' media lines line up and audio/video flow both ways.
      if (role === "caller") {
        if (stream) {
          for (const t of stream.getTracks()) {
            const sender = pc.addTrack(t, stream);
            if (t.kind === "video") videoSenderRef.current = sender;
          }
        }
        if (!videoSenderRef.current) {
          videoSenderRef.current = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
        }
        if (!stream || stream.getAudioTracks().length === 0) {
          pc.addTransceiver("audio", { direction: "recvonly" });
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendOffer(callId, JSON.stringify(offer));
      }
      localReady = true;
    })();

    // Adaptive signaling poll: fast (300ms) while connecting so the offer →
    // answer → ICE handshake completes in well under a second per step, then
    // ramp down to a slow trickle once media is flowing. Runs immediately.
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const pollOnce = async () => {
      if (!alive) return;
      let sig;
      try {
        sig = await getSignal(callId);
      } catch {
        if (alive) pollTimer = setTimeout(pollOnce, pollDelay);
        return;
      }
      try {
        // Apply a new (or ICE-restart) offer whenever the SDP changes.
        if (role === "callee" && sig.offer && sig.offer !== lastOfferApplied && localReady) {
          lastOfferApplied = sig.offer;
          await pc.setRemoteDescription(JSON.parse(sig.offer));
          // First time only: attach our local media AFTER the remote
          // description so tracks bind to the offer's m-lines (makes it two-way).
          if (!tracksAdded) {
            const s = streamRef.current;
            if (s) {
              for (const t of s.getTracks()) {
                const sender = pc.addTrack(t, s);
                if (t.kind === "video") videoSenderRef.current = sender;
              }
            }
            tracksAdded = true;
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendAnswer(callId, JSON.stringify(answer));
          // capture the video sender for screen-share
          videoSenderRef.current =
            pc.getSenders().find((x) => x.track?.kind === "video") ??
            pc.getTransceivers().find((t) => t.receiver.track?.kind === "video")?.sender ??
            videoSenderRef.current;
        }
        // Apply a new (or ICE-restart) answer whenever the SDP changes and we
        // have an outstanding local offer.
        if (role === "caller" && sig.answer && sig.answer !== lastAnswerApplied && pc.signalingState === "have-local-offer") {
          lastAnswerApplied = sig.answer;
          await pc.setRemoteDescription(JSON.parse(sig.answer));
        }
        // Apply ICE only after a remote description is set — otherwise early
        // candidates get dropped and the call stays stuck "Connecting".
        const remoteReady = role === "caller" ? !!lastAnswerApplied : !!lastOfferApplied;
        if (remoteReady) {
          const mine = role === "caller" ? sig.iceFromCallee : sig.iceFromCaller;
          let idx = role === "caller" ? iceCalleeIdx : iceCallerIdx;
          for (; idx < mine.length; idx++) {
            try { await pc.addIceCandidate(JSON.parse(mine[idx])); } catch { /* ignore */ }
          }
          if (role === "caller") iceCalleeIdx = idx;
          else iceCallerIdx = idx;
        }
      } catch { /* transient signaling error */ }
      // Once connected, keep only a slow trickle for late candidates.
      if (pc.connectionState === "connected") pollDelay = 2500;
      if (alive) pollTimer = setTimeout(pollOnce, pollDelay);
    };
    pollOnce();

    return () => {
      alive = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (troubleTimer) clearTimeout(troubleTimer);
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch { /* ignore */ }
      pcRef.current = null;
      videoSenderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [isPeer, config.callId, config.role, isVideo]);

  /* ---- duration timer ---- */
  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  /* ---- live speech-to-text — transcribes YOUR microphone for the record ----
     A self-healing loop: browsers stop recognition on every result/silence, so
     we always restart it. Uses en-US (widely supported); paused while muted. */
  useEffect(() => {
    // Recording/transcription is for meetings only — never for 1:1 member calls.
    if (!isMeeting || status !== "live" || !micOn) return;
    const Ctor = getSRCtor();
    if (!Ctor) return;

    let stopped = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const begin = () => {
      if (stopped) return;
      const recog = new Ctor();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "en-US";

      recog.onresult = (e: SREvent) => {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const clean = r[0].transcript.trim();
            if (clean) {
              setMicDenied(false);
              setTranscript((prev) => [
                ...prev,
                { id: "you-" + Date.now() + "-" + Math.random(), speaker: "You", self: true, text: clean, at: clock() },
              ]);
            }
          } else {
            live += r[0].transcript;
          }
        }
        setInterim(live);
      };

      recog.onerror = (e) => {
        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
          setMicDenied(true);
          stopped = true; // don't hammer when permission is blocked
        }
        // other errors (no-speech / aborted / network) → onend restarts us
      };

      recog.onend = () => {
        setInterim("");
        if (!stopped) {
          if (restartTimer) clearTimeout(restartTimer);
          restartTimer = setTimeout(begin, 300);
        }
      };

      recogRef.current = recog;
      try {
        recog.start();
      } catch {
        if (!stopped) restartTimer = setTimeout(begin, 400);
      }
    };

    begin();

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      const r = recogRef.current;
      recogRef.current = null;
      if (r) {
        r.onend = null;
        r.onerror = null;
        r.onresult = null;
        try { r.abort(); } catch { /* ignore */ }
      }
      setInterim("");
    };
  }, [status, micOn, isMeeting]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, interim]);

  /* ---- controls ---- */
  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
  }
  function toggleCam() {
    const next = !camOn;
    setCamOn(next);
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
  }
  function stopSharing() {
    shareStreamRef.current?.getTracks().forEach((t) => t.stop());
    shareStreamRef.current = null;
    setSharing(false);
    // peer: send the camera again (or nothing, for a voice call)
    if (isPeer) videoSenderRef.current?.replaceTrack(camTrackRef.current).catch(() => {});
  }

  async function toggleShare() {
    setShowMore(false);
    if (sharing) {
      stopSharing();
      return;
    }
    const md = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia?: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
    };
    if (!md.getDisplayMedia) {
      flash("Screen sharing isn't supported here");
      return;
    }
    try {
      const stream = await md.getDisplayMedia({ video: true, audio: false });
      shareStreamRef.current = stream;
      setSharing(true);
      const screenTrack = stream.getVideoTracks()[0];
      // peer: replace the outgoing video track so the other member sees your screen
      if (isPeer && screenTrack) videoSenderRef.current?.replaceTrack(screenTrack).catch(() => {});
      // stop when the user ends sharing from the browser's own UI
      screenTrack?.addEventListener("ended", () => stopSharing());
    } catch {
      flash("Screen share cancelled");
    }
  }
  function toggleSpeaker() {
    setShowMore(false);
    setSpeakerOn((prev) => {
      const next = !prev;
      // mute/unmute any remote playback elements
      document
        .querySelectorAll<HTMLMediaElement>("[data-remote-audio]")
        .forEach((el) => (el.muted = !next));
      flash(next ? "Speaker on" : "Speaker muted");
      return next;
    });
  }
  function endCall() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    shareStreamRef.current?.getTracks().forEach((t) => t.stop());
    shareStreamRef.current = null;
    recogRef.current = null;
    try { pcRef.current?.close(); } catch { /* ignore */ }
    pcRef.current = null;
    setStatus("ended");
  }

  // bind the captured screen to the share <video> once it mounts
  useEffect(() => {
    if (sharing && shareRef.current && shareStreamRef.current) {
      shareRef.current.srcObject = shareStreamRef.current;
    }
  }, [sharing]);

  /* ---- ended summary ---- */
  if (status === "ended") {
    return <EndedSummary config={config} duration={seconds} lines={transcript} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0b0f] text-white">
      {/* Connection banner — reconnection after a drop, or trouble connecting */}
      {(reconnecting || connectTrouble) && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
          <span className="flex items-center gap-2 rounded-full bg-[var(--color-amber)] px-3.5 py-1.5 text-xs font-bold text-white shadow-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {reconnecting ? "Reconnecting…" : "Trouble connecting — check your network"}
          </span>
        </div>
      )}
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            {status === "connecting" ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…</>
            ) : (
              <><span className="size-2 animate-pulse rounded-full bg-[var(--color-green)]" /> {fmtDuration(seconds)}</>
            )}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 truncate font-bold">
              {isMeeting && <Users className="h-4 w-4 text-white/70" />}
              {config.title}
            </div>
            {config.subtitle && <div className="truncate text-xs text-white/60">{config.subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMeeting && srSupported && micOn && !micDenied && (
            <span className="hidden items-center gap-1.5 rounded-full bg-[var(--color-danger)]/20 px-3 py-1 text-xs font-semibold text-[#ff8b96] sm:flex">
              <Circle className="h-2.5 w-2.5 animate-pulse fill-current" /> REC · transcribing
            </span>
          )}
          {!isMeeting && (
            <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70 sm:flex">
              <ShieldCheck className="h-3 w-3 text-[var(--color-green)]" /> Private · not recorded
            </span>
          )}
          <button onClick={endCall} className="grid size-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Stage */}
      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3 sm:px-6">
        <div className="relative min-w-0 flex-1">
          {isPeer ? (
            <PeerStage
              peer={participants[0]}
              status={status}
              remoteVideoRef={remoteVideoRef}
              remoteHasVideo={remoteHasVideo}
              localVideoRef={videoRef}
              shareRef={shareRef}
              sharing={sharing}
              camOn={camOn}
              isVideo={isVideo}
              mediaError={mediaError}
            />
          ) : sharing ? (
            <ShareStage shareRef={shareRef} onStop={toggleShare} />
          ) : isVideo ? (
            <VideoStage
              participants={participants}
              camOn={camOn}
              mediaError={mediaError}
              videoRef={videoRef}
              isMeeting={isMeeting}
            />
          ) : (
            <VoiceStage participants={participants} status={status} />
          )}

          {/* hand raised toast */}
          {handRaised && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-[var(--color-brand)] px-3 py-1 text-xs font-bold text-white shadow-lg">
              ✋ You raised your hand
            </div>
          )}

          {/* transient toast (speaker / share feedback) */}
          {toast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur">
              {toast}
            </div>
          )}
        </div>

        {/* Transcript panel — meetings only */}
        {isMeeting && showTranscript && (
          <aside className="hidden w-[330px] shrink-0 flex-col overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/10 md:flex">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <FileText className="h-4 w-4 text-[var(--color-brand)]" /> Live transcript
              </div>
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                <ShieldCheck className="h-3 w-3 text-[var(--color-green)]" /> Auto-saved
              </span>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {transcript.length === 0 && !interim && (
                <div className="grid gap-2 pt-8 text-center">
                  {!srSupported ? (
                    <p className="text-xs text-white/45">Live captions aren&apos;t supported in this browser. Try Chrome or Edge.</p>
                  ) : micDenied ? (
                    <p className="text-xs text-[#ff8b96]">Microphone access is blocked — allow it in your browser to transcribe.</p>
                  ) : !micOn ? (
                    <p className="text-xs text-white/45">You&apos;re muted — unmute to capture your words.</p>
                  ) : (
                    <>
                      <span className="mx-auto flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/70">
                        <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-green)]" /> Listening
                      </span>
                      <p className="text-xs text-white/40">Start speaking — your words appear here and are saved to the record.</p>
                    </>
                  )}
                </div>
              )}
              {transcript.map((l) => (
                <div key={l.id}>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xs font-bold ${l.self ? "text-[var(--color-brand)]" : "text-white/80"}`}>{l.speaker}</span>
                    <span className="text-[10px] text-white/30">{l.at}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-white/75">{l.text}</p>
                </div>
              ))}
              {interim && (
                <p className="text-[13px] italic leading-relaxed text-white/40">{interim}…</p>
              )}
              <div ref={transcriptEndRef} />
            </div>
            <div className="border-t border-white/10 px-4 py-2 text-[10px] text-white/40">
              {transcript.length} lines captured · for record purposes
            </div>
          </aside>
        )}
      </div>

      {/* Controls */}
      <footer className="flex shrink-0 items-center justify-center gap-2 pb-5 pt-1 sm:gap-3">
        <CtrlButton on={micOn} onClick={toggleMic} label={micOn ? "Mute" : "Unmute"}
          icon={micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />} danger={!micOn} />
        {isVideo && (
          <CtrlButton on={camOn} onClick={toggleCam} label={camOn ? "Stop video" : "Start video"}
            icon={camOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />} danger={!camOn} />
        )}
        {isMeeting && (
          <CtrlButton on onClick={() => setHandRaised((v) => !v)} label="Raise hand"
            icon={<Hand className="h-5 w-5" />} active={handRaised} />
        )}
        {isMeeting && (
          <CtrlButton on label="Captions" onClick={() => setShowTranscript((v) => !v)}
            icon={<Captions className="h-5 w-5" />} active={showTranscript} />
        )}
        <CtrlButton on label={sharing ? "Stop sharing" : "Share screen"} onClick={toggleShare}
          icon={<ScreenShare className="h-5 w-5" />} active={sharing} className="hidden sm:grid" />
        <CtrlButton on label={speakerOn ? "Speaker off" : "Speaker on"} onClick={toggleSpeaker}
          icon={speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          danger={!speakerOn} className="hidden sm:grid" />

        {/* Mobile: collapse Share + Speaker into a More menu */}
        <div className="relative grid sm:hidden">
          {showMore && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMore(false)} />
              <div className="absolute bottom-14 left-1/2 z-20 w-44 -translate-x-1/2 overflow-hidden rounded-2xl bg-[#1c1c24] p-1 shadow-2xl ring-1 ring-white/10">
                <MenuRow icon={<ScreenShare className="h-4 w-4" />} label={sharing ? "Stop sharing" : "Share screen"} active={sharing} onClick={toggleShare} />
                <MenuRow icon={speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} label={speakerOn ? "Mute speaker" : "Unmute speaker"} onClick={toggleSpeaker} />
              </div>
            </>
          )}
          <CtrlButton on label="More" onClick={() => setShowMore((v) => !v)}
            icon={<MoreHorizontal className="h-5 w-5" />} active={showMore} />
        </div>

        <button
          onClick={endCall}
          className="ml-1 flex h-12 items-center gap-2 rounded-full bg-[var(--color-danger)] px-6 font-bold text-white shadow-lg transition hover:opacity-90"
        >
          <PhoneOff className="h-5 w-5" /> <span className="hidden sm:inline">End</span>
        </button>
      </footer>
    </div>
  );
}

/* ------------------------------ sub-views ------------------------------ */

function PeerStage({
  peer,
  status,
  remoteVideoRef,
  remoteHasVideo,
  localVideoRef,
  shareRef,
  sharing,
  camOn,
  isVideo,
  mediaError,
}: {
  peer: CallParticipant;
  status: string;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteHasVideo: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  shareRef: React.RefObject<HTMLVideoElement | null>;
  sharing: boolean;
  camOn: boolean;
  isVideo: boolean;
  mediaError: string | null;
}) {
  const selfHidden = sharing ? false : !isVideo || !camOn || !!mediaError;
  return (
    <div className="relative h-full">
      {/* Remote (main) — the other member. Audio plays through this element. */}
      <div className="relative grid h-full place-items-center overflow-hidden rounded-2xl bg-[#16161c] ring-1 ring-white/10">
        <video
          ref={remoteVideoRef}
          data-remote-audio
          autoPlay
          playsInline
          className="size-full object-contain"
        />
        {!remoteHasVideo && (
          <div className="absolute inset-0 grid place-items-center bg-[#16161c] text-center">
            <div>
              <div className="relative mx-auto grid size-28 place-items-center">
                {status !== "live" && <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-brand)]/20" />}
                <Portrait p={peer} round />
              </div>
              <h2 className="mt-5 text-xl font-extrabold">{peer.name}</h2>
              <p className="mt-1 text-sm text-white/60">{status === "connecting" ? "Connecting…" : "Connected"}</p>
            </div>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-lg bg-black/50 px-2.5 py-1 text-xs font-semibold backdrop-blur">
          {peer.name}
        </span>
      </div>

      {/* Self PiP — your camera, or your screen while presenting. */}
      <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-xl bg-black ring-2 ring-white/20 sm:h-40 sm:w-56">
        {sharing ? (
          <video ref={shareRef} autoPlay muted playsInline className="size-full object-contain" />
        ) : (
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`size-full -scale-x-100 object-cover ${selfHidden ? "hidden" : ""}`}
          />
        )}
        {selfHidden && (
          <div className="grid size-full place-items-center bg-[#16161c] text-center">
            <div>
              <div className="mx-auto grid size-10 place-items-center rounded-full bg-[var(--color-brand)] font-bold">You</div>
              {mediaError && <p className="mt-1 px-2 text-[10px] text-white/50">{mediaError}</p>}
            </div>
          </div>
        )}
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold">
          {sharing ? "Your screen" : "You"}
        </span>
      </div>
    </div>
  );
}

function VideoStage({
  participants,
  camOn,
  mediaError,
  videoRef,
  isMeeting,
}: {
  participants: CallParticipant[];
  camOn: boolean;
  mediaError: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isMeeting: boolean;
}) {
  const cols = participants.length <= 1 ? "grid-cols-1" : participants.length <= 4 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className="relative h-full">
      <div className={`grid h-full gap-3 ${cols}`}>
        {participants.map((p, i) => (
          <div key={i} className="relative grid place-items-center overflow-hidden rounded-2xl bg-white/[0.05] ring-1 ring-white/10">
            <Portrait p={p} big={participants.length === 1} />
            <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1 text-xs font-semibold backdrop-blur">
              <Mic className="h-3 w-3 text-[var(--color-green)]" /> {p.name}
              {p.role && <span className="text-white/50">· {p.role}</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Self PiP */}
      <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-xl bg-black ring-2 ring-white/20 sm:h-40 sm:w-56">
        <video ref={videoRef} autoPlay muted playsInline className={`size-full -scale-x-100 object-cover ${camOn && !mediaError ? "" : "hidden"}`} />
        {(!camOn || mediaError) && (
          <div className="grid size-full place-items-center bg-[#16161c] text-center">
            <div>
              <div className="mx-auto grid size-10 place-items-center rounded-full bg-[var(--color-brand)] font-bold">You</div>
              <p className="mt-1 px-2 text-[10px] text-white/50">{mediaError ?? "Camera off"}</p>
            </div>
          </div>
        )}
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold">You</span>
      </div>

      {isMeeting && (
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold backdrop-blur">
          <Users className="h-3.5 w-3.5" /> {participants.length + 1} in call
        </span>
      )}
    </div>
  );
}

function ShareStage({
  shareRef,
  onStop,
}: {
  shareRef: React.RefObject<HTMLVideoElement | null>;
  onStop: () => void;
}) {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
      <video ref={shareRef} autoPlay muted playsInline className="size-full object-contain" />
      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[var(--color-brand)] px-3 py-1 text-xs font-bold text-white shadow">
        <ScreenShare className="h-3.5 w-3.5" /> You&apos;re presenting
      </span>
      <button
        onClick={onStop}
        className="absolute right-3 top-3 rounded-full bg-[var(--color-danger)] px-3 py-1 text-xs font-bold text-white shadow transition hover:opacity-90"
      >
        Stop sharing
      </button>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-white/10 ${
        active ? "text-[var(--color-brand)]" : "text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function VoiceStage({ participants, status }: { participants: CallParticipant[]; status: string }) {
  const p = participants[0];
  return (
    <div className="grid h-full place-items-center rounded-2xl bg-gradient-to-b from-white/[0.06] to-transparent">
      <div className="text-center">
        <div className="relative mx-auto grid size-32 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-brand)]/20" />
          <span className="absolute inset-2 rounded-full bg-[var(--color-brand)]/15" />
          <Portrait p={p} round />
        </div>
        <h2 className="mt-6 text-2xl font-extrabold">{p.name}</h2>
        <p className="mt-1 text-sm text-white/60">{status === "connecting" ? "Calling…" : "Voice call · in progress"}</p>
      </div>
    </div>
  );
}

function Portrait({ p, big, round }: { p: CallParticipant; big?: boolean; round?: boolean }) {
  const size = round ? "size-28" : big ? "size-28" : "size-20";
  if (p.photo) {
    return <img src={p.photo} alt={p.name} className={`${size} ${round ? "rounded-full" : "rounded-2xl"} object-cover`} />;
  }
  return (
    <div
      className={`${size} grid place-items-center ${round ? "rounded-full" : "rounded-2xl"} text-2xl font-bold text-white`}
      style={{ backgroundColor: p.color ?? "#7a7068" }}
    >
      {initials(p.name)}
    </div>
  );
}

function CtrlButton({
  icon,
  label,
  onClick,
  danger,
  active,
  className = "grid",
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`${className} size-12 place-items-center rounded-full transition ${
        danger
          ? "bg-[var(--color-danger)] text-white hover:opacity-90"
          : active
          ? "bg-[var(--color-brand)] text-white"
          : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {icon}
    </button>
  );
}

/* ------------------------------ ended view ------------------------------ */

function EndedSummary({
  config,
  duration,
  lines,
  onClose,
}: {
  config: CallConfig;
  duration: number;
  lines: TranscriptLine[];
  onClose: () => void;
}) {
  function download() {
    const header = `${config.title}\n${config.subtitle ?? ""}\nDuration: ${fmtDuration(duration)}\n${"=".repeat(40)}\n\n`;
    const body = lines.map((l) => `[${l.at}] ${l.speaker}: ${l.text}`).join("\n");
    const blob = new Blob([header + body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.title.replace(/\s+/g, "-").toLowerCase()}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#0b0b0f]/95 p-4 text-white backdrop-blur">
      <div className="w-full max-w-md rounded-3xl bg-[#16161c] p-6 ring-1 ring-white/10">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--color-danger)]/20 text-[var(--color-danger)]">
          <PhoneOff className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-center text-xl font-extrabold">Call ended</h2>
        <p className="mt-1 text-center text-sm text-white/60">{config.title} · {fmtDuration(duration)}</p>

        <div className="mt-5 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
          <div className="flex items-center gap-2 text-sm font-bold">
            <FileText className="h-4 w-4 text-[var(--color-brand)]" /> Transcript saved for records
          </div>
          <p className="mt-1 text-xs text-white/55">
            {lines.length} lines captured by automatic speech-to-text. Stored to the meeting record.
          </p>
          {lines.length > 0 && (
            <div className="mt-3 max-h-28 space-y-1.5 overflow-y-auto text-[12px] text-white/60">
              {lines.slice(-4).map((l) => (
                <div key={l.id}><span className="font-semibold text-white/80">{l.speaker}:</span> {l.text}</div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={download}
            disabled={lines.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-bold transition hover:bg-white/20 disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Download
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl gradient-brand py-3 text-sm font-bold text-white transition hover:opacity-95">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
