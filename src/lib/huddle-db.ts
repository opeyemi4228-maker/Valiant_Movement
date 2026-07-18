import "server-only";
import { and, desc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  communities,
  communityMembers,
  huddlePeers,
  huddleSignals,
  huddles,
  messages,
  profiles,
  users,
} from "@/db/schema";
import { notify } from "./notify";

/* ============================================================
   Community huddles — group voice/video calls. Every community
   member can join the room; media flows over a MESH of pairwise
   WebRTC links, each pair signaling through its own row
   (a_id < b_id; A is always the offer side, so both browsers
   derive their role without negotiation).
   ============================================================ */

/** A peer is "in the room" while its heartbeat is fresher than this. */
const PEER_TTL_MS = 20_000;

export interface HuddlePeerDTO {
  id: string;
  name: string;
  avatar: string | null;
}

export interface HuddleSignalDTO {
  peerId: string;
  offer: string | null;
  answer: string | null;
  iceA: string[];
  iceB: string[];
}

async function nameOf(userId: string): Promise<string> {
  const [row] = await db
    .select({ name: profiles.fullName, email: users.email })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name?.trim() || row?.email?.split("@")[0] || "A member";
}

function pair(me: string, other: string): { aId: string; bId: string } {
  return me < other ? { aId: me, bId: other } : { aId: other, bId: me };
}

/** The community's live huddle (if any) — for the "join" banner. */
export async function activeHuddleFor(
  communityId: string,
): Promise<{ huddleId: string; mode: string; count: number } | null> {
  const [c] = await db
    .select({ conversationId: communities.conversationId })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (!c?.conversationId) return null;

  const [h] = await db
    .select({ id: huddles.id, mode: huddles.mode })
    .from(huddles)
    .where(and(eq(huddles.conversationId, c.conversationId), isNull(huddles.endedAt)))
    .orderBy(desc(huddles.startedAt))
    .limit(1);
  if (!h) return null;

  const fresh = new Date(Date.now() - PEER_TTL_MS);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(huddlePeers)
    .where(and(eq(huddlePeers.huddleId, h.id), isNull(huddlePeers.leftAt), gt(huddlePeers.lastSeenAt, fresh)));
  if (n === 0) {
    // everyone's heartbeat died (closed tabs) — retire the room
    await db.update(huddles).set({ endedAt: new Date() }).where(and(eq(huddles.id, h.id), isNull(huddles.endedAt)));
    return null;
  }
  return { huddleId: h.id, mode: h.mode, count: n };
}

/** Start (or join the already-live) huddle for a community. */
export async function startOrJoinHuddle(
  userId: string,
  communityId: string,
  mode: "voice" | "video",
): Promise<{ ok: boolean; huddleId?: string; mode?: string; error?: string }> {
  const [membership] = await db
    .select({ role: communityMembers.role })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
    .limit(1);
  if (!membership) return { ok: false, error: "Only members of this community can join its huddle." };

  const [c] = await db
    .select({ conversationId: communities.conversationId, name: communities.name })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (!c?.conversationId) return { ok: false, error: "Open the community chat once before starting a huddle." };

  const live = await activeHuddleFor(communityId);
  let huddleId = live?.huddleId;
  let liveMode = live?.mode ?? mode;

  if (!huddleId) {
    const [h] = await db
      .insert(huddles)
      .values({ conversationId: c.conversationId, mode, startedBy: userId })
      .returning({ id: huddles.id });
    huddleId = h.id;
    liveMode = mode;

    // Announce in the thread + ring the bell of every member (best-effort).
    const who = await nameOf(userId);
    const label = mode === "video" ? "video" : "voice";
    await db.insert(messages).values({
      conversationId: c.conversationId,
      senderId: userId,
      body: `${who} started a live ${label} huddle — join from the community chat`,
      media: { kind: "system", systemEvent: "joined" },
      deliveredAt: new Date(),
    });
    void (async () => {
      try {
        const members = await db
          .select({ id: communityMembers.userId })
          .from(communityMembers)
          .where(and(eq(communityMembers.communityId, communityId), ne(communityMembers.userId, userId)))
          .limit(100);
        await Promise.all(
          members.map((m) =>
            notify(m.id, {
              type: "call",
              actorId: userId,
              actorName: who,
              body: `${who} started a live ${label} huddle in ${c.name} — tap Communities to join`,
              href: "communities",
            }),
          ),
        );
      } catch (err) {
        console.error("huddle announce failed:", err);
      }
    })();
  }

  await db
    .insert(huddlePeers)
    .values({ huddleId, userId })
    .onConflictDoUpdate({
      target: [huddlePeers.huddleId, huddlePeers.userId],
      set: { lastSeenAt: new Date(), leftAt: null },
    });

  return { ok: true, huddleId, mode: liveMode };
}

/** Heartbeat + room state: active peers and my pair signals, in one trip. */
export async function pollHuddle(
  userId: string,
  huddleId: string,
): Promise<{ ended: boolean; peers: HuddlePeerDTO[]; signals: HuddleSignalDTO[] }> {
  await db
    .update(huddlePeers)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(huddlePeers.huddleId, huddleId), eq(huddlePeers.userId, userId), isNull(huddlePeers.leftAt)));

  const [h] = await db
    .select({ endedAt: huddles.endedAt })
    .from(huddles)
    .where(eq(huddles.id, huddleId))
    .limit(1);
  if (!h || h.endedAt) return { ended: true, peers: [], signals: [] };

  const fresh = new Date(Date.now() - PEER_TTL_MS);
  const peerRows = await db
    .select({ id: huddlePeers.userId, name: profiles.fullName, email: users.email, avatar: profiles.avatarUrl })
    .from(huddlePeers)
    .innerJoin(users, eq(users.id, huddlePeers.userId))
    .leftJoin(profiles, eq(profiles.userId, huddlePeers.userId))
    .where(
      and(
        eq(huddlePeers.huddleId, huddleId),
        isNull(huddlePeers.leftAt),
        gt(huddlePeers.lastSeenAt, fresh),
        ne(huddlePeers.userId, userId),
      ),
    );

  const sigRows = await db
    .select()
    .from(huddleSignals)
    .where(
      and(eq(huddleSignals.huddleId, huddleId), or(eq(huddleSignals.aId, userId), eq(huddleSignals.bId, userId))),
    );

  return {
    ended: false,
    peers: peerRows.map((p) => ({
      id: p.id,
      name: p.name?.trim() || p.email.split("@")[0],
      avatar: p.avatar,
    })),
    signals: sigRows.map((s) => ({
      peerId: s.aId === userId ? s.bId : s.aId,
      offer: s.offer,
      answer: s.answer,
      iceA: (s.iceA as string[]) ?? [],
      iceB: (s.iceB as string[]) ?? [],
    })),
  };
}

export async function leaveHuddle(userId: string, huddleId: string): Promise<void> {
  await db
    .update(huddlePeers)
    .set({ leftAt: new Date() })
    .where(and(eq(huddlePeers.huddleId, huddleId), eq(huddlePeers.userId, userId)));
  const fresh = new Date(Date.now() - PEER_TTL_MS);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(huddlePeers)
    .where(and(eq(huddlePeers.huddleId, huddleId), isNull(huddlePeers.leftAt), gt(huddlePeers.lastSeenAt, fresh)));
  if (n === 0) {
    await db.update(huddles).set({ endedAt: new Date() }).where(and(eq(huddles.id, huddleId), isNull(huddles.endedAt)));
  }
}

/** Store an SDP for my pair with `otherId` (creates the pair row lazily). */
export async function setHuddleSdp(
  userId: string,
  huddleId: string,
  otherId: string,
  kind: "offer" | "answer",
  sdp: string,
): Promise<void> {
  const { aId, bId } = pair(userId, otherId);
  await db.insert(huddleSignals).values({ huddleId, aId, bId }).onConflictDoNothing();
  await db
    .update(huddleSignals)
    .set(kind === "offer" ? { offer: sdp } : { answer: sdp })
    .where(and(eq(huddleSignals.huddleId, huddleId), eq(huddleSignals.aId, aId), eq(huddleSignals.bId, bId)));
}

/** Append one of my ICE candidates for the pair with `otherId`. */
export async function addHuddleIce(
  userId: string,
  huddleId: string,
  otherId: string,
  candidate: string,
): Promise<void> {
  const { aId, bId } = pair(userId, otherId);
  await db.insert(huddleSignals).values({ huddleId, aId, bId }).onConflictDoNothing();
  const add = sql`${JSON.stringify([candidate])}::jsonb`;
  await db
    .update(huddleSignals)
    .set(userId === aId ? { iceA: sql`${huddleSignals.iceA} || ${add}` } : { iceB: sql`${huddleSignals.iceB} || ${add}` })
    .where(and(eq(huddleSignals.huddleId, huddleId), eq(huddleSignals.aId, aId), eq(huddleSignals.bId, bId)));
}
