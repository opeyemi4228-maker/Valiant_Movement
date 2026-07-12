import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { usesDb } from "./env";
import * as mem from "./demo-store";
import type { NotifInput, NotifType, NotificationDTO } from "./notif-types";

/* ============================================================
   Notification write/read layer. Routes by the recipient id:
   real DB users (UUID) → Postgres, demo/in-memory members → the
   demo store. Every write is best-effort — a notification must
   never break the action that triggered it.
   ============================================================ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Create a notification for `userId` (recipient). Fire-and-forget safe. */
export async function notify(userId: string, input: NotifInput): Promise<void> {
  try {
    if (usesDb(userId)) {
      await db.insert(notifications).values({
        userId,
        type: input.type,
        // actor_id is a uuid FK — only set it for real DB actors.
        actorId: input.actorId && UUID_RE.test(input.actorId) ? input.actorId : null,
        actorName: input.actorName ?? null,
        body: input.body,
        href: input.href ?? null,
      });
    } else {
      mem.addNotification(userId, input);
    }
  } catch {
    /* best-effort: never block the triggering action */
  }
}

export async function listNotifications(userId: string): Promise<NotificationDTO[]> {
  if (usesDb(userId)) {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return rows.map((r) => ({
      id: r.id,
      type: r.type as NotifType,
      actorName: r.actorName,
      body: r.body,
      href: r.href,
      read: !!r.readAt,
      at: new Date(r.createdAt).toISOString(),
    }));
  }
  return mem.listNotifications(userId);
}

export async function unreadNotifCount(userId: string): Promise<number> {
  if (usesDb(userId)) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.n ?? 0;
  }
  return mem.unreadNotifCount(userId);
}

export async function markNotifsRead(userId: string): Promise<void> {
  if (usesDb(userId)) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  } else {
    mem.markNotificationsRead(userId);
  }
}
