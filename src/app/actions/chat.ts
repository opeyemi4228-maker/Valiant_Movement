"use server";

import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, messages, profiles, users } from "@/db/schema";
import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import * as mem from "@/lib/demo-store";
import { scanMessage } from "@/lib/moderation";
import { notify, hasRecentNotif } from "@/lib/notify";

/* ============================================================
   Real member-to-member chat — backed by the conversations /
   conversation_members / messages tables. Every action is
   authorised against the signed-in DB member. The demo member
   (id "demo-member") has no DB row, so chat is unavailable to it.
   ============================================================ */

export interface ChatMember {
  id: string;
  name: string;
  username: string | null;
  email: string;
  avatar: string | null;
}

export interface ChatConversation {
  id: string;
  type: "direct" | "group";
  otherId: string | null;
  otherAvatar: string | null;
  title: string;
  lastBody: string | null;
  lastHasMedia: boolean;
  lastMedia: ChatMedia | null;
  lastAt: string | null;
  unread: number;
}

export interface ChatMessageDTO {
  id: string;
  body: string | null;
  mine: boolean;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  media: ChatMedia | null;
  at: string; // ISO
}

export interface ChatMedia {
  kind: "image" | "audio" | "file" | "call" | "system";
  url?: string;
  name?: string;
  size?: string;
  duration?: number; // seconds — voice-note length or call length
  // kind === "call": an entry in the thread's call log. "missed" covers both
  // an unanswered ring and a caller cancel; "completed" carries `duration`.
  callMode?: "voice" | "video";
  callStatus?: "missed" | "declined" | "completed";
  // kind === "system": server-authored thread event (body carries the text)
  systemEvent?: "joined";
}

/** Server-side input ceilings (the client also enforces its own). */
const MAX_BODY_CHARS = 4000;
const MAX_MEDIA_DATAURL_CHARS = 7_500_000; // ≈ 5.5 MB decoded

async function meId(): Promise<string | null> {
  const u = await getCurrentUserSafe();
  if (!u || u.id === "demo-member") return null; // demo account isn't a DB user
  return u.id;
}

function fullName(p: { fullName: string | null } | undefined, email: string) {
  return p?.fullName?.trim() || email.split("@")[0];
}

/* ----------------------------- bootstrap ----------------------------- */

export async function loadChat(): Promise<{
  available: boolean;
  conversations: ChatConversation[];
  members: ChatMember[];
}> {
  const id = await meId();
  if (!id) return { available: false, conversations: [], members: [] };
  // Demo-session members (slug ids) stay on the in-memory backend even when
  // a DB is configured — their ids must never reach uuid columns.
  if (!usesDb(id)) return mem.loadChat(id);

  // Other verified members you can message. First query after opening the
  // tab — retried so a Neon cold start doesn't take down the page.
  const memberRows = await withRetry(() =>
    db
      .select({
        id: users.id,
        email: users.email,
        name: profiles.fullName,
        username: profiles.username,
        avatar: profiles.avatarUrl,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(ne(users.id, id))
      .orderBy(asc(profiles.fullName))
      .limit(200),
  );

  const members: ChatMember[] = memberRows.map((m) => ({
    id: m.id,
    name: fullName({ fullName: m.name }, m.email),
    username: m.username,
    email: m.email,
    avatar: m.avatar,
  }));

  const conversations = await getConversationsFor(id);
  return { available: true, conversations, members };
}

async function getConversationsFor(id: string): Promise<ChatConversation[]> {
  // Personal Messages = direct chats only. Community group chats live in the
  // Communities dashboard — mixing them here confused both surfaces.
  const memberships = await db
    .select({
      conversationId: conversationMembers.conversationId,
      lastReadAt: conversationMembers.lastReadAt,
      type: conversations.type,
      title: conversations.title,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.userId, id), eq(conversations.type, "direct")));

  if (memberships.length === 0) return [];
  const convoIds = memberships.map((m) => m.conversationId);
  const lastReadById = new Map(memberships.map((m) => [m.conversationId, m.lastReadAt]));
  const metaById = new Map(memberships.map((m) => [m.conversationId, { type: m.type, title: m.title }]));

  // Other participant per conversation — direct chats only (groups can have
  // thousands of members; their title comes from the conversation itself).
  const directIds = memberships.filter((m) => m.type !== "group").map((m) => m.conversationId);
  const others = directIds.length
    ? await db
        .select({
          conversationId: conversationMembers.conversationId,
          userId: users.id,
          email: users.email,
          name: profiles.fullName,
          avatar: profiles.avatarUrl,
        })
        .from(conversationMembers)
        .innerJoin(users, eq(users.id, conversationMembers.userId))
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .where(and(inArray(conversationMembers.conversationId, directIds), ne(conversationMembers.userId, id)))
    : [];

  const otherByConvo = new Map(others.map((o) => [o.conversationId, o]));

  const result: ChatConversation[] = [];
  for (const cid of convoIds) {
    const other = otherByConvo.get(cid);
    const [last] = await db
      .select({ body: messages.body, media: messages.media, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, cid))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    const lastRead = lastReadById.get(cid) ?? null;
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, cid),
          ne(messages.senderId, id),
          // system events ("X joined") never count as unread
          sql`(${messages.media}->>'kind') IS DISTINCT FROM 'system'`,
          lastRead ? gt(messages.createdAt, lastRead) : undefined,
        ),
      );

    const meta = metaById.get(cid);
    const isGroup = meta?.type === "group";
    result.push({
      id: cid,
      type: isGroup ? "group" : "direct",
      otherId: isGroup ? null : other?.userId ?? null,
      otherAvatar: isGroup ? null : other?.avatar ?? null,
      title: isGroup
        ? meta?.title ?? "Group"
        : other
          ? fullName({ fullName: other.name }, other.email)
          : "Conversation",
      lastBody: last?.body ?? null,
      lastHasMedia: !!last?.media,
      lastMedia: (last?.media as ChatMedia | null) ?? null,
      lastAt: last?.createdAt ? new Date(last.createdAt).toISOString() : null,
      unread: n ?? 0,
    });
  }

  // newest activity first
  result.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  return result;
}

/** Polled by the client. Returns null on a transient failure so callers keep
 *  their current list instead of flashing empty. */
export async function refreshConversations(): Promise<ChatConversation[] | null> {
  const id = await meId();
  if (!id) return [];
  if (!usesDb(id)) return mem.conversationsFor(id);
  try {
    return await withRetry(() => getConversationsFor(id));
  } catch (err) {
    console.error("refreshConversations failed (returning null):", err);
    return null;
  }
}

/* ------------------------- start a direct chat ------------------------- */

export async function startDirect(otherUserId: string): Promise<{ ok: boolean; conversationId?: string; error?: string }> {
  const id = await meId();
  if (!id) return { ok: false, error: "Sign in as a registered member to chat." };
  if (otherUserId === id) return { ok: false, error: "You can't message yourself." };
  if (!usesDb(id)) return mem.startDirect(id, otherUserId);

  // Existing direct conversation with this person?
  const mine = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, id));
  const myIds = mine.map((m) => m.conversationId);

  if (myIds.length) {
    const [existing] = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(
        and(
          eq(conversationMembers.userId, otherUserId),
          eq(conversations.type, "direct"),
          inArray(conversationMembers.conversationId, myIds),
        ),
      )
      .limit(1);
    if (existing) return { ok: true, conversationId: existing.conversationId };
  }

  // Create it.
  const [convo] = await db.insert(conversations).values({ type: "direct" }).returning({ id: conversations.id });
  await db.insert(conversationMembers).values([
    { conversationId: convo.id, userId: id },
    { conversationId: convo.id, userId: otherUserId },
  ]);
  return { ok: true, conversationId: convo.id };
}

/* ----------------------------- messages ----------------------------- */

async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);
  return !!row;
}

export async function getMessages(conversationId: string): Promise<{
  ok: boolean;
  messages: ChatMessageDTO[];
  /** When the other member last opened this thread — drives read receipts. */
  otherLastReadAt?: string | null;
  error?: string;
}> {
  const id = await meId();
  if (!id) return { ok: false, messages: [], error: "unauthenticated" };
  if (!usesDb(id)) return mem.getMessages(id, conversationId);

  // Polled every ~2.5s — a transient Neon failure must degrade to "nothing
  // new" (the client keeps what it has and the next poll recovers), never
  // crash the page.
  try {
    if (!(await withRetry(() => isMember(conversationId, id)))) {
      return { ok: false, messages: [], error: "forbidden" };
    }

    const others = await db
      .select({ lastReadAt: conversationMembers.lastReadAt })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, id)));
    // "Read" means every other member has seen it — use the earliest read mark.
    const otherLastReadAt = others.length && others.every((o) => o.lastReadAt)
      ? new Date(Math.min(...others.map((o) => o.lastReadAt!.getTime()))).toISOString()
      : null;

    const rows = await db
      .select({
        id: messages.id,
        body: messages.body,
        media: messages.media,
        senderId: messages.senderId,
        createdAt: messages.createdAt,
        senderName: profiles.fullName,
        senderEmail: users.email,
        senderAvatar: profiles.avatarUrl,
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .leftJoin(profiles, eq(profiles.userId, messages.senderId))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(500);

    // Mark this conversation read for me.
    await db
      .update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, id)));

    return {
      ok: true,
      otherLastReadAt,
      messages: rows.map((r) => ({
        id: r.id,
        body: r.body,
        mine: r.senderId === id,
        senderId: r.senderId,
        senderName: fullName({ fullName: r.senderName }, r.senderEmail),
        senderAvatar: r.senderAvatar,
        media: (r.media as ChatMedia | null) ?? null,
        at: new Date(r.createdAt).toISOString(),
      })),
    };
  } catch (err) {
    console.error("getMessages failed (returning empty):", err);
    return { ok: false, messages: [], error: "transient" };
  }
}

export async function sendMessage(
  conversationId: string,
  body: string,
  media?: ChatMedia | null,
): Promise<{ ok: boolean; message?: ChatMessageDTO; error?: string; flagged?: boolean }> {
  const id = await meId();
  if (!id) return { ok: false, error: "Sign in as a registered member to chat." };

  // Safety scan — concerning language alerts the sender's Ward Captain and
  // LGA Coordinator automatically (the message is still delivered).
  const hit = scanMessage(body);

  if (!usesDb(id)) {
    const res = mem.sendMessage(id, conversationId, body, media);
    if (res.ok && res.message && hit.flagged) {
      mem.recordModerationAlert({
        convId: conversationId,
        messageId: res.message.id,
        senderId: id,
        categories: hit.categories,
        excerpt: body,
      });
    }
    return { ...res, flagged: hit.flagged };
  }
  if (!(await isMember(conversationId, id))) return { ok: false, error: "forbidden" };
  const text = body.trim().slice(0, MAX_BODY_CHARS);
  if (!text && !media) return { ok: false, error: "empty" };
  if (media?.kind === "call" || media?.kind === "system") {
    return { ok: false, error: "forbidden" }; // server-authored kinds only
  }
  if (media?.url && media.url.length > MAX_MEDIA_DATAURL_CHARS) {
    return { ok: false, error: "Attachment is too large — keep it under 5 MB." };
  }

  const [row] = await db
    .insert(messages)
    .values({ conversationId, senderId: id, body: text || null, media: media ?? null, deliveredAt: new Date() })
    .returning({ id: messages.id, createdAt: messages.createdAt });

  if (hit.flagged) {
    mem.recordModerationAlert({
      convId: conversationId,
      messageId: row.id,
      senderId: id,
      categories: hit.categories,
      excerpt: text,
    });
  }

  // Unread-message notification for the other member of a DIRECT chat —
  // throttled to one per sender per 10 minutes so a burst doesn't spam.
  void (async () => {
    try {
      const [convo] = await db
        .select({ type: conversations.type })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (convo?.type !== "direct") return;
      const [other] = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, id)))
        .limit(1);
      if (!other) return;
      if (await hasRecentNotif(other.userId, "message", { actorId: id, withinMs: 10 * 60_000 })) return;
      const u = await getCurrentUserSafe();
      const who = u?.fullName ?? "A member";
      await notify(other.userId, {
        type: "message",
        actorId: id,
        actorName: who,
        body: `${who} sent you a message`,
        href: "messages",
      });
    } catch {
      /* best-effort */
    }
  })();

  return {
    ok: true,
    flagged: hit.flagged,
    message: {
      id: row.id,
      body: text || null,
      mine: true,
      senderId: id,
      senderName: "You",
      senderAvatar: null,
      media: media ?? null,
      at: new Date(row.createdAt).toISOString(),
    },
  };
}

export async function markRead(conversationId: string): Promise<void> {
  const id = await meId();
  if (!id) return;
  if (!usesDb(id)) {
    mem.markRead(id, conversationId);
    return;
  }
  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, id)));
}
