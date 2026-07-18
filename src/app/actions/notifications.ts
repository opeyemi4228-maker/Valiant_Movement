"use server";

import { getCurrentUserSafe } from "@/lib/session";
import * as N from "@/lib/notify";
import type { NotificationDTO } from "@/lib/notif-types";

/* Notification center — real, per-member alerts (likes, comments, calls…). */

export async function getNotifications(): Promise<{ items: NotificationDTO[]; unread: number }> {
  const u = await getCurrentUserSafe();
  if (!u) return { items: [], unread: 0 };
  const [items, unread] = await Promise.all([N.listNotifications(u.id), N.unreadNotifCount(u.id)]);
  return { items, unread };
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
