"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { withRetry } from "@/lib/retry";
import * as N from "@/lib/notify";
import type { NotificationDTO } from "@/lib/notif-types";

/* Notification center — real, per-member alerts (likes, comments, calls…). */

/** Polled every ~1.5s. Both reads run concurrently and are retried as one
 *  unit. Returns `null` on a transient failure (retries exhausted) so the
 *  client keeps its last-known list/badge instead of flashing it empty —
 *  the next poll tick recovers. */
export async function getNotifications(): Promise<{ items: NotificationDTO[]; unread: number } | null> {
  const u = await getCurrentUserSafe();
  if (!u) return { items: [], unread: 0 };
  try {
    const [items, unread] = await withRetry(() => Promise.all([N.listNotifications(u.id), N.unreadNotifCount(u.id)]));
    return { items, unread };
  } catch (err) {
    console.error("getNotifications failed (returning null so the client keeps its last-known state):", err);
    return null;
  }
}

export async function getUnreadNotifCount(): Promise<number> {
  const u = await getCurrentUserSafe();
  if (!u) return 0;
  return N.unreadNotifCount(u.id);
}

export async function markNotificationsRead(): Promise<void> {
  const u = await getCurrentUserSafe();
  if (!u) return;
  await N.markNotifsRead(u.id);
}
