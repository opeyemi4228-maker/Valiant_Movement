"use server";

import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, messages, profiles, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { hasDb } from "@/lib/env";
import * as mem from "@/lib/demo-store";
import { scanMessage } from "@/lib/moderation";

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
}

export interface ChatConversation {
  id: string;
  otherId: string | null;
  title: string;
  lastBody: string | null;
  lastHasMedia: boolean;
  lastAt: string | null;
  unread: number;
}

export interface ChatMessageDTO {
  id: string;
  body: string | null;
  mine: boolean;
  senderName: string;
  media: ChatMedia | null;
  at: string; // ISO
}

export interface ChatMedia {
  kind: "image" | "audio" | "file";
  url?: string;
  name?: string;
  size?: string;
  duration?: number;
}

async function meId(): Promise<string | null> {
  const u = await getCurrentUser();
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
  if (!hasDb()) return mem.loadChat(id);

  // Other verified members you can message.
  const memberRows = await db
    .select({ id: users.id, email: users.email, name: profiles.fullName, username: profiles.username })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(ne(users.id, id))
    .orderBy(asc(profiles.fullName))
    .limit(200);

  const members: ChatMember[] = memberRows.map((m) => ({
    id: m.id,
    name: fullName({ fullName: m.name }, m.email),
    username: m.username,
    email: m.email,
  }));

  const conversations = await getConversationsFor(id);
  return { available: true, conversations, members };
}

async function getConversationsFor(id: string): Promise<ChatConversation[]> {
  const memberships = await db
    .select({ conversationId: conversationMembers.conversationId, lastReadAt: conversationMembers.lastReadAt })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, id));

  if (memberships.length === 0) return [];
  const convoIds = memberships.map((m) => m.conversationId);
  const lastReadById = new Map(memberships.map((m) => [m.conversationId, m.lastReadAt]));

  // Other participant per conversation (direct chats).
  const others = await db
    .select({
      conversationId: conversationMembers.conversationId,
      userId: users.id,
      email: users.email,
      name: profiles.fullName,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(inArray(conversationMembers.conversationId, convoIds), ne(conversationMembers.userId, id)));

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
          lastRead ? gt(messages.createdAt, lastRead) : undefined,
        ),
      );

    result.push({
      id: cid,
      otherId: other?.userId ?? null,
      title: other ? fullName({ fullName: other.name }, other.email) : "Conversation",
      lastBody: last?.body ?? null,
      lastHasMedia: !!last?.media,
      lastAt: last?.createdAt ? new Date(last.createdAt).toISOString() : null,
      unread: n ?? 0,
    });
  }

  // newest activity first
  result.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  return result;
}

export async function refreshConversations(): Promise<ChatConversation[]> {
  const id = await meId();
  if (!id) return [];
  if (!hasDb()) return mem.conversationsFor(id);
  return getConversationsFor(id);
}

/* ------------------------- start a direct chat ------------------------- */

export async function startDirect(otherUserId: string): Promise<{ ok: boolean; conversationId?: string; error?: string }> {
  const id = await meId();
  if (!id) return { ok: false, error: "Sign in as a registered member to chat." };
  if (otherUserId === id) return { ok: false, error: "You can't message yourself." };
  if (!hasDb()) return mem.startDirect(id, otherUserId);

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

export async function getMessages(conversationId: string): Promise<{ ok: boolean; messages: ChatMessageDTO[]; error?: string }> {
  const id = await meId();
  if (!id) return { ok: false, messages: [], error: "unauthenticated" };
  if (!hasDb()) return mem.getMessages(id, conversationId);
  if (!(await isMember(conversationId, id))) return { ok: false, messages: [], error: "forbidden" };

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      media: messages.media,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
      senderName: profiles.fullName,
      senderEmail: users.email,
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
    messages: rows.map((r) => ({
      id: r.id,
      body: r.body,
      mine: r.senderId === id,
      senderName: fullName({ fullName: r.senderName }, r.senderEmail),
      media: (r.media as ChatMedia | null) ?? null,
      at: new Date(r.createdAt).toISOString(),
    })),
  };
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

  if (!hasDb()) {
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
  const text = body.trim();
  if (!text && !media) return { ok: false, error: "empty" };

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

  return {
    ok: true,
    flagged: hit.flagged,
    message: {
      id: row.id,
      body: text || null,
      mine: true,
      senderName: "You",
      media: media ?? null,
      at: new Date(row.createdAt).toISOString(),
    },
  };
}

export async function markRead(conversationId: string): Promise<void> {
  const id = await meId();
  if (!id) return;
  if (!hasDb()) {
    mem.markRead(id, conversationId);
    return;
  }
  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, id)));
}
