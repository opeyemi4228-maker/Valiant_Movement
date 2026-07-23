"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, PhoneOff, Users, Video as VideoIcon, VideoOff } from "lucide-react";
import {
  leaveCommunityHuddle,
  pollCommunityHuddle,
  sendHuddleIce,
  sendHuddleSdp,
} from "@/app/actions/huddle";
import type { HuddlePeerDTO } from "@/lib/huddle-db";

/* ============================================================
   HuddleRoom — a community group call. Media flows over a mesh:
   one RTCPeerConnection per other participant, each pair
   signaling through its own channel. The lower user-id of a
   pair is ALWAYS the offer side, so roles never need
   negotiating — late joiners connect to everyone already in.
   ============================================================ */

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(",").map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  } else {
    servers.push(
      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    );
  }
  return servers;
}

interface PeerLink {
  pc: RTCPeerConnection;
  offered: boolean;
  appliedOffer: string;
  appliedAnswer: string;
  iceIdx: number;
  restarting: boolean; // an ICE-restart offer is in flight for this pair
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function HuddleRoom({
  huddleId,
  meId,
  mode,
  title,
  onClose,
}: {
  huddleId: string;
  meId: string;
  mode: "voice" | "video";
  title: string;
  onClose: () => void;
}) {
  const isVideo = mode === "video";
  const [peers, setPeers] = useState<HuddlePeerDTO[]>([]);
  const [streams, setStreams] = useState<Map<string, MediaStream>>(new Map());
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(isVideo);
  const [mediaError, setMediaError] = useState<string | null>(null);
  /** True once the camera/mic are actually open (only after someone joins). */
  const [mediaLive, setMediaLive] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const linksRef = useRef<Map<string, PeerLink>>(new Map());
  const closedRef = useRef(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror the toggles so media acquired later starts in the chosen state.
  const micOnRef = useRef(true);
  const camOnRef = useRef(isVideo);
  useEffect(() => { micOnRef.current = micOn; }, [micOn]);
  useEffect(() => { camOnRef.current = camOn; }, [camOn]);

  /* ---- timer ---- */
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /* ---- mesh: local media + signaling loop ---- */
  useEffect(() => {
    let alive = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const links = linksRef.current; // stable Map for this room's lifetime

    // Cancel any deferred "leave" from a just-prior cleanup (see below) —
    // this is the remount half of React's dev-only mount→cleanup→remount
    // cycle (Strict Mode), not a real return to the room.
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }

    const teardownPeer = (id: string) => {
      const link = links.get(id);
      if (!link) return;
      try { link.pc.close(); } catch { /* ignore */ }
      links.delete(id);
      setStreams((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    };

    const ensurePeer = (peerId: string): PeerLink => {
      let link = links.get(peerId);
      if (link) return link;
      const pc = new RTCPeerConnection({ iceServers: iceServers(), iceCandidatePoolSize: 2 });
      const local = localStreamRef.current;
      if (local) for (const t of local.getTracks()) pc.addTrack(t, local);
      pc.onicecandidate = (e) => {
        if (e.candidate) sendHuddleIce(huddleId, peerId, JSON.stringify(e.candidate)).catch(() => {});
      };
      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (!stream) return;
        setStreams((prev) => {
          const next = new Map(prev);
          next.set(peerId, stream);
          return next;
        });
      };
      // Self-heal a dropped pairwise link (WiFi↔cellular switch, brief NAT
      // rebind, transient packet loss) — without this, a peer whose
      // connection blips just freezes forever, which reads as "the call
      // keeps dropping" even though the huddle itself is still live.
      pc.onconnectionstatechange = () => {
        if (!alive) return;
        const st = pc.connectionState;
        if (st !== "failed" && st !== "disconnected") return;
        const l = links.get(peerId);
        if (!l || l.restarting) return;
        const iAmOffer = meId < peerId;
        if (!iAmOffer) return; // the offer side drives recovery; the answer side just re-answers the new offer
        l.restarting = true;
        (async () => {
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            await sendHuddleSdp(huddleId, peerId, "offer", JSON.stringify(offer));
          } catch { /* connection stays in "failed" — retried on the next state change */ } finally {
            l.restarting = false;
          }
        })();
      };
      link = { pc, offered: false, appliedOffer: "", appliedAnswer: "", iceIdx: 0, restarting: false };
      links.set(peerId, link);
      return link;
    };

    (async () => {
      // Camera/mic are acquired LAZILY — there's no reason to film an empty
      // room, so nothing opens while you're waiting alone. The moment the
      // first other member appears we acquire media, and because a peer's
      // RTCPeerConnection is only created after this resolves, the tracks
      // attach on the first offer (no renegotiation needed).
      let mediaPending: Promise<void> | null = null;
      const acquireMedia = (): Promise<void> => {
        if (mediaPending) return mediaPending;
        mediaPending = (async () => {
          try {
            localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
          } catch {
            try {
              localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
              if (alive && isVideo) setMediaError("Camera unavailable — audio only");
            } catch {
              if (alive) setMediaError("Microphone unavailable");
            }
          }
          const local = localStreamRef.current;
          if (!alive) {
            local?.getTracks().forEach((t) => t.stop());
            localStreamRef.current = null;
            return;
          }
          if (local && localVideoRef.current && local.getVideoTracks().length) {
            localVideoRef.current.srcObject = local;
          }
          // Honour any mute/camera-off chosen while waiting alone.
          local?.getAudioTracks().forEach((t) => (t.enabled = micOnRef.current));
          local?.getVideoTracks().forEach((t) => (t.enabled = camOnRef.current));
          if (isVideo && (!local || local.getVideoTracks().length === 0)) setCamOn(false);
          if (alive) setMediaLive(!!local);
        })();
        return mediaPending;
      };

      let endedStreak = 0;
      const pollOnce = async () => {
        if (!alive) return;
        const res = await pollCommunityHuddle(huddleId);
        if (!alive) return;
        // Only close on a *sustained* "ended" — a single blip (a hiccup
        // reading the session, a momentary DB error) must never drop a live
        // huddle out from under everyone.
        if (res.ended) {
          if (++endedStreak >= 3) {
            onClose();
            return;
          }
          if (alive) pollTimer = setTimeout(pollOnce, 300);
          return;
        }
        endedStreak = 0;
        setPeers(res.peers);

        // Someone else is here → now we open the camera/mic.
        if (res.peers.length > 0 && !localStreamRef.current) {
          await acquireMedia();
          if (!alive) return;
        }

        const liveIds = new Set(res.peers.map((p) => p.id));
        for (const id of [...links.keys()]) {
          if (!liveIds.has(id)) teardownPeer(id); // they left
        }

        for (const peer of res.peers) {
          const link = ensurePeer(peer.id);
          const iAmOffer = meId < peer.id;
          const sig = res.signals.find((s) => s.peerId === peer.id);
          try {
            if (iAmOffer) {
              if (!link.offered) {
                link.offered = true;
                const offer = await link.pc.createOffer();
                await link.pc.setLocalDescription(offer);
                await sendHuddleSdp(huddleId, peer.id, "offer", JSON.stringify(offer));
              }
              if (sig?.answer && sig.answer !== link.appliedAnswer && link.pc.signalingState === "have-local-offer") {
                link.appliedAnswer = sig.answer;
                await link.pc.setRemoteDescription(JSON.parse(sig.answer));
              }
            } else if (sig?.offer && sig.offer !== link.appliedOffer) {
              link.appliedOffer = sig.offer;
              await link.pc.setRemoteDescription(JSON.parse(sig.offer));
              const answer = await link.pc.createAnswer();
              await link.pc.setLocalDescription(answer);
              await sendHuddleSdp(huddleId, peer.id, "answer", JSON.stringify(answer));
            }
            // Their ICE: I read the side I did NOT write.
            if (sig) {
              const theirs = meId < peer.id ? sig.iceB : sig.iceA;
              const hasRemote = !!link.pc.remoteDescription;
              if (hasRemote) {
                for (; link.iceIdx < theirs.length; link.iceIdx++) {
                  try { await link.pc.addIceCandidate(JSON.parse(theirs[link.iceIdx])); } catch { /* ignore */ }
                }
              }
            }
          } catch { /* transient signaling error — next poll retries */ }
        }
        if (alive) pollTimer = setTimeout(pollOnce, 200);
      };
      pollOnce();
    })();

    return () => {
      alive = false;
      if (pollTimer) clearTimeout(pollTimer);
      for (const id of [...links.keys()]) teardownPeer(id);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      // Defer the actual "I'm leaving" server call — React's development
      // Strict Mode mounts every effect, cleans it up, then remounts it
      // once, purely to surface exactly this kind of bug (a cleanup that
      // isn't safe to run on a phantom unmount). A REAL unmount has no
      // matching remount, so the deferred call below still fires; the
      // Strict Mode remount cancels it (see the cancellation at the top of
      // this effect) before it ever reaches the server. Without this, a
      // solo huddle starter's room was being ended within moments of
      // opening it, every single time, in development.
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = setTimeout(() => {
        leaveTimerRef.current = null;
        if (!closedRef.current) {
          closedRef.current = true;
          leaveCommunityHuddle(huddleId).catch(() => {});
        }
      }, 400);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huddleId, meId, isVideo]);

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
  }
  function toggleCam() {
    const next = !camOn;
    setCamOn(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
  }
  function leave() {
    if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    closedRef.current = true;
    leaveCommunityHuddle(huddleId).catch(() => {});
    onClose();
  }

  const inRoom = peers.length + 1;
  const cols = inRoom <= 2 ? "grid-cols-1 sm:grid-cols-2" : inRoom <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0b0f] text-white">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            <span className="size-2 animate-pulse rounded-full bg-[var(--color-green)]" /> {fmtDuration(seconds)}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 truncate font-bold">
              <Users className="h-4 w-4 text-white/70" /> {title}
            </div>
            <div className="truncate text-xs text-white/60">
              Community huddle · {inRoom} in the room
            </div>
          </div>
        </div>
        {mediaError && (
          <span className="hidden rounded-full bg-[var(--color-amber)]/20 px-3 py-1 text-xs font-semibold text-[var(--color-amber)] sm:block">
            {mediaError}
          </span>
        )}
      </header>

      {/* Tiles */}
      <div className="min-h-0 flex-1 px-3 pb-3 sm:px-6">
        <div className={`grid h-full gap-3 ${cols}`}>
          {/* Me */}
          <div className="relative grid place-items-center overflow-hidden rounded-2xl bg-[#16161c] ring-1 ring-white/10">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`size-full -scale-x-100 object-cover ${isVideo && camOn && mediaLive && !mediaError ? "" : "hidden"}`}
            />
            {(!isVideo || !camOn || !mediaLive || mediaError) && (
              <div className="text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--color-brand)] text-xl font-bold">
                  You
                </div>
                {!mediaLive && !mediaError && (
                  <p className="mt-3 text-xs text-white/50">
                    {isVideo ? "Camera starts when someone joins" : "Mic starts when someone joins"}
                  </p>
                )}
              </div>
            )}
            <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-0.5 text-xs font-semibold backdrop-blur">
              {micOn ? <Mic className="h-3 w-3 text-[var(--color-green)]" /> : <MicOff className="h-3 w-3 text-[var(--color-danger)]" />}
              You
            </span>
          </div>

          {/* Others */}
          {peers.map((p) => (
            <PeerTile key={p.id} peer={p} stream={streams.get(p.id) ?? null} />
          ))}

          {peers.length === 0 && (
            <div className="grid place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
              <div className="text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-white/50" />
                <p className="mt-3 max-w-[240px] text-sm text-white/55">
                  Waiting for members to join — everyone in the community has been notified.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <footer className="flex shrink-0 items-center justify-center gap-3 pb-5 pt-1">
        <button
          onClick={toggleMic}
          title={micOn ? "Mute" : "Unmute"}
          className={`grid size-12 place-items-center rounded-full transition ${micOn ? "bg-white/10 hover:bg-white/20" : "bg-[var(--color-danger)]"}`}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        {isVideo && (
          <button
            onClick={toggleCam}
            title={camOn ? "Stop video" : "Start video"}
            className={`grid size-12 place-items-center rounded-full transition ${camOn ? "bg-white/10 hover:bg-white/20" : "bg-[var(--color-danger)]"}`}
          >
            {camOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
        )}
        <button
          onClick={leave}
          className="flex h-12 items-center gap-2 rounded-full bg-[var(--color-danger)] px-6 font-bold text-white shadow-lg transition hover:opacity-90"
        >
          <PhoneOff className="h-5 w-5" /> Leave
        </button>
      </footer>
    </div>
  );
}

function PeerTile({ peer, stream }: { peer: HuddlePeerDTO; stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
    const update = () => setHasVideo(!!stream && stream.getVideoTracks().some((t) => !t.muted && t.readyState === "live"));
    update();
    const track = stream?.getVideoTracks()[0];
    track?.addEventListener("mute", update);
    track?.addEventListener("unmute", update);
    return () => {
      track?.removeEventListener("mute", update);
      track?.removeEventListener("unmute", update);
    };
  }, [stream]);

  return (
    <div className="relative grid place-items-center overflow-hidden rounded-2xl bg-[#16161c] ring-1 ring-white/10">
      {/* video doubles as the audio sink for this peer */}
      <video ref={ref} autoPlay playsInline className={`size-full object-cover ${hasVideo ? "" : "hidden"}`} />
      {!hasVideo &&
        (peer.avatar ? (
          <img src={peer.avatar} alt={peer.name} className="size-20 rounded-full object-cover" />
        ) : (
          <div className="grid size-20 place-items-center rounded-full bg-[#7c3aed] text-xl font-bold">
            {initials(peer.name)}
          </div>
        ))}
      <span className="absolute bottom-2 left-2 rounded-lg bg-black/50 px-2 py-0.5 text-xs font-semibold backdrop-blur">
        {peer.name}
      </span>
      {!stream && (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white/70">
          <Loader2 className="h-3 w-3 animate-spin" /> connecting
        </span>
      )}
    </div>
  );
}
