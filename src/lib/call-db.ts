import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { callSignals, conversationMembers, messages, profiles, users } from "@/db/schema";
import type { CallSignal, CallMode, CallStatus } from "./call-types";
import { CALL_MIN_EACH, type CallEligibility } from "./demo-store";

/* ============================================================
   Database-backed call signaling + presence. Mirrors the
   in-memory demo store but is shared across serverless
   instances (Vercel), so ring/accept and WebRTC offer/answer/
   ICE actually reach the other member. Used by realtime.ts
   whenever a real Postgres connection is configured.
   ============================================================ */

const RING_TTL_MS = 35_000;

const COLORS = ["#e07400", "#1faa59", "#7c3aed", "#0ea5e9", "#e23d4e", "#f5a524", "#0d9488", "#db2777"];
function colorFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

interface CallRow {
  id: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  callerColor: string;
  calleeName: string;
  mode: string;
  status: string;
  createdAt: Date;
}

function rowToSignal(r: CallRow): CallSignal {
  let status = r.status as CallStatus;
  // A ringing call that was never answered becomes "missed" after the TTL.
  if (status === "ringing" && Date.now() - new Date(r.createdAt).getTime() > RING_TTL_MS) {
    status = "missed";
  }
  return {
    id: r.id,
    callerId: r.callerId,
    callerName: r.callerName,
    callerColor: r.callerColor,
    calleeId: r.calleeId,
    calleeName: r.calleeName,
    mode: r.mode as CallMode,
    status,
    at: new Date(r.createdAt).getTime(),
  };
}

async function nameOf(userId: string): Promise<string> {
  const [row] = await db
    .select({ name: profiles.fullName, email: users.email })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name?.trim() || row?.email?.split("@")[0] || "Member";
}

/* ------------------------------- calls ------------------------------- */

export async function placeCall(callerId: string, calleeId: string, mode: CallMode): Promise<CallSignal> {
  // Retire any prior live calls involving the caller.
  await db
    .update(callSignals)
    .set({ status: "ended", updatedAt: new Date() })
    .where(
      and(
        or(eq(callSignals.callerId, callerId), eq(callSignals.calleeId, callerId)),
        inArray(callSignals.status, ["ringing", "accepted"]),
      ),
    );

  const [callerName, calleeName] = await Promise.all([nameOf(callerId), nameOf(calleeId)]);
  const [row] = await db
    .insert(callSignals)
    .values({
      callerId,
      calleeId,
      callerName,
      callerColor: colorFor(callerId),
      calleeName,
      mode,
      status: "ringing",
    })
    .returning();
  return rowToSignal(row as unknown as CallRow);
}

export async function getCallSignal(id: string): Promise<CallSignal | null> {
  const [row] = await db.select().from(callSignals).where(eq(callSignals.id, id)).limit(1);
  if (!row) return null;
  const sig = rowToSignal(row as unknown as CallRow);
  // Persist the ringing→missed transition so both sides observe it.
  if (sig.status === "missed" && row.status === "ringing") {
    await db.update(callSignals).set({ status: "missed", updatedAt: new Date() }).where(eq(callSignals.id, id));
  }
  return sig;
}

export async function incomingCallFor(calleeId: string): Promise<CallSignal | null> {
  const [row] = await db
    .select()
    .from(callSignals)
    .where(and(eq(callSignals.calleeId, calleeId), eq(callSignals.status, "ringing")))
    .orderBy(desc(callSignals.createdAt))
    .limit(1);
  if (!row) return null;
  const sig = rowToSignal(row as unknown as CallRow);
  return sig.status === "ringing" ? sig : null;
}

export async function answerCallSignal(id: string, meId: string): Promise<CallSignal | null> {
  await db
    .update(callSignals)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(and(eq(callSignals.id, id), eq(callSignals.calleeId, meId), eq(callSignals.status, "ringing")));
  return getCallSignal(id);
}

export async function declineCallSignal(id: string, meId: string): Promise<CallSignal | null> {
  await db
    .update(callSignals)
    .set({ status: "declined", updatedAt: new Date() })
    .where(
      and(
        eq(callSignals.id, id),
        or(eq(callSignals.calleeId, meId), eq(callSignals.callerId, meId)),
        inArray(callSignals.status, ["ringing", "accepted"]),
      ),
    );
  return getCallSignal(id);
}

export async function endCallSignal(id: string): Promise<void> {
  await db
    .update(callSignals)
    .set({ status: "ended", updatedAt: new Date() })
    .where(and(eq(callSignals.id, id), ne(callSignals.status, "missed"), ne(callSignals.status, "declined")));
}

/* --------------------------- WebRTC signaling --------------------------- */

export async function rtcSetOffer(id: string, sdp: string): Promise<void> {
  await db.update(callSignals).set({ offer: sdp, updatedAt: new Date() }).where(eq(callSignals.id, id));
}

export async function rtcSetAnswer(id: string, sdp: string): Promise<void> {
  await db.update(callSignals).set({ answer: sdp, updatedAt: new Date() }).where(eq(callSignals.id, id));
}

export async function rtcAddIce(id: string, from: "caller" | "callee", candidate: string): Promise<void> {
  const add = sql`${JSON.stringify([candidate])}::jsonb`;
  if (from === "caller") {
    await db
      .update(callSignals)
      .set({ iceCaller: sql`${callSignals.iceCaller} || ${add}`, updatedAt: new Date() })
      .where(eq(callSignals.id, id));
  } else {
    await db
      .update(callSignals)
      .set({ iceCallee: sql`${callSignals.iceCallee} || ${add}`, updatedAt: new Date() })
      .where(eq(callSignals.id, id));
  }
}

export async function rtcGet(id: string): Promise<{
  offer?: string;
  answer?: string;
  iceFromCaller: string[];
  iceFromCallee: string[];
}> {
  const [row] = await db
    .select({
      offer: callSignals.offer,
      answer: callSignals.answer,
      iceCaller: callSignals.iceCaller,
      iceCallee: callSignals.iceCallee,
    })
    .from(callSignals)
    .where(eq(callSignals.id, id))
    .limit(1);
  return {
    offer: row?.offer ?? undefined,
    answer: row?.answer ?? undefined,
    iceFromCaller: (row?.iceCaller as string[]) ?? [],
    iceFromCallee: (row?.iceCallee as string[]) ?? [],
  };
}

/* ----------------------------- presence ----------------------------- */

export async function unreadFor(meId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, meId)),
    )
    .where(
      and(
        ne(messages.senderId, meId),
        or(isNull(conversationMembers.lastReadAt), gt(messages.createdAt, conversationMembers.lastReadAt)),
      ),
    );
  return row?.n ?? 0;
}

export async function callEligibility(meId: string, otherId: string): Promise<CallEligibility> {
  const mine = await db
    .select({ c: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, meId));
  const ids = mine.map((r) => r.c);
  if (ids.length === 0) return { ok: false, sentByMe: 0, sentByOther: 0, need: CALL_MIN_EACH };

  const [shared] = await db
    .select({ c: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.userId, otherId), inArray(conversationMembers.conversationId, ids)))
    .limit(1);
  if (!shared) return { ok: false, sentByMe: 0, sentByOther: 0, need: CALL_MIN_EACH };

  const rows = await db
    .select({ senderId: messages.senderId, n: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.conversationId, shared.c))
    .groupBy(messages.senderId);

  const sentByMe = rows.find((r) => r.senderId === meId)?.n ?? 0;
  const sentByOther = rows.find((r) => r.senderId === otherId)?.n ?? 0;
  return {
    ok: sentByMe >= CALL_MIN_EACH && sentByOther >= CALL_MIN_EACH,
    sentByMe,
    sentByOther,
    need: CALL_MIN_EACH,
  };
}
