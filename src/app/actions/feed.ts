"use server";

import { getCurrentUserSafe } from "@/lib/session";
import { usesDb } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import * as mem from "@/lib/demo-store";
import * as fdb from "@/lib/feed-db";
import { notify } from "@/lib/notify";
import type { FeedPost } from "@/lib/feed-types";
import type { StoryDTO } from "@/lib/feed-db";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ne } from "drizzle-orm";

/* ============================================================
   Live feed — Postgres for real members (posts persist across
   restarts; stories live 24h), the in-memory store for demo
   sessions. Publishing fans a "new post" notification out to
   other members.
   ============================================================ */

async function me(): Promise<{ id: string; name: string; avatar: string | null } | null> {
  const u = await getCurrentUserSafe();
  if (!u) return null;
  // Refresh the mirror so name/avatar edits propagate into demo surfaces.
  mem.ensureMember(u.id, u.fullName ?? "Member", u.avatarUrl);
  return { id: u.id, name: u.fullName ?? "Member", avatar: u.avatarUrl };
}

/** Returns `null` on a transient failure (retries exhausted) so a caller
 *  that's polling keeps its last-known posts instead of flashing empty. */
export async function loadFeed(): Promise<{ available: boolean; posts: FeedPost[] } | null> {
  const u = await me();
  if (!u) return { available: false, posts: [] };
  if (!usesDb(u.id)) return { available: true, posts: mem.listPosts(u.id) };
  try {
    return { available: true, posts: await withRetry(() => fdb.listPosts(u.id)) };
  } catch (err) {
    console.error("loadFeed failed (returning null so the caller keeps its last-known state):", err);
    return null;
  }
}

/**
 * Posts + stories in one round trip. The Home tab needs both on every
 * mount and every ~300ms poll; calling them as two separate server actions
 * meant two independent session look-ups and two client↔server hops for
 * data that always travels together — this is the single request instead.
 *
 * Returns `null` on a transient failure (retries exhausted) so the client
 * keeps its last-known feed on screen instead of flashing it empty — the
 * next poll tick recovers.
 */
export async function loadFeedBundle(): Promise<{ available: boolean; posts: FeedPost[]; stories: StoryDTO[] } | null> {
  const u = await me();
  if (!u) return { available: false, posts: [], stories: [] };
  if (!usesDb(u.id)) return { available: true, posts: mem.listPosts(u.id), stories: [] };
  try {
    const [posts, stories] = await withRetry(() => Promise.all([fdb.listPosts(u.id), fdb.listStories(u.id)]));
    return { available: true, posts, stories };
  } catch (err) {
    console.error("loadFeedBundle failed (returning null so the client keeps its last-known state):", err);
    return null;
  }
}

/** Fan a "new post" alert out to other members (best-effort, capped). */
async function announcePost(authorId: string, authorName: string): Promise<void> {
  try {
    const others = usesDb(authorId)
      ? await db.select({ id: users.id }).from(users).where(ne(users.id, authorId)).limit(100)
      : mem.listMembers(authorId).map((m) => ({ id: m.id }));
    await Promise.all(
      others.map((o) =>
        notify(o.id, {
          type: "post",
          actorId: authorId,
          actorName: authorName,
          body: `${authorName} shared a new post`,
          href: "home",
        }),
      ),
    );
  } catch (err) {
    console.error("announcePost failed:", err);
  }
}

export async function publishPost(text: string, image?: string): Promise<{ ok: boolean; error?: string }> {
  const u = await me();
  if (!u) return { ok: false, error: "Sign in to post." };
  if (!text.trim() && !image) return { ok: false, error: "empty" };
  if (image && image.length > 1_500_000) return { ok: false, error: "That image is too large." };
  if (usesDb(u.id)) await fdb.addPost(u.id, text, image);
  else mem.addPost(u.id, text, image);
  await announcePost(u.id, u.name);
  return { ok: true };
}

export async function likePost(postId: string): Promise<{ ok: boolean; post?: FeedPost }> {
  const u = await me();
  if (!u) return { ok: false };
  if (usesDb(u.id)) {
    const res = await fdb.toggleLike(u.id, postId);
    if (!res) return { ok: false };
    if (res.liked && res.authorId !== u.id) {
      await notify(res.authorId, {
        type: "like",
        actorId: u.id,
        actorName: u.name,
        body: `${u.name} liked your post`,
        href: "home",
      });
    }
    return { ok: true, post: res.post };
  }
  const post = mem.toggleLike(u.id, postId);
  if (post && post.liked && post.authorId !== u.id) {
    await notify(post.authorId, { type: "like", actorId: u.id, actorName: u.name, body: `${u.name} liked your post`, href: "home" });
  }
  return post ? { ok: true, post } : { ok: false };
}

export async function repostPost(postId: string): Promise<{ ok: boolean; post?: FeedPost }> {
  const u = await me();
  if (!u) return { ok: false };
  if (usesDb(u.id)) {
    const res = await fdb.toggleRepost(u.id, postId);
    return res === null ? { ok: false } : { ok: true, post: res.post };
  }
  const post = mem.toggleRepost(u.id, postId);
  return post ? { ok: true, post } : { ok: false };
}

export async function bookmarkPost(postId: string): Promise<{ ok: boolean; bookmarked?: boolean; post?: FeedPost }> {
  const u = await me();
  if (!u) return { ok: false };
  if (usesDb(u.id)) {
    const res = await fdb.toggleBookmark(u.id, postId);
    return res === null ? { ok: false } : { ok: true, bookmarked: res.bookmarked, post: res.post };
  }
  const post = mem.toggleBookmark(u.id, postId);
  return post ? { ok: true, bookmarked: post.bookmarked, post } : { ok: false };
}

/** Polled every ~1.5s. Returns `null` on a transient failure (retries
 *  exhausted) so the client keeps its last-known list instead of flashing
 *  it empty — the next poll tick recovers. */
export async function loadBookmarks(): Promise<{ available: boolean; posts: FeedPost[] } | null> {
  const u = await me();
  if (!u) return { available: false, posts: [] };
  if (!usesDb(u.id)) return { available: true, posts: mem.listBookmarks(u.id) };
  try {
    return { available: true, posts: await withRetry(() => fdb.listBookmarks(u.id)) };
  } catch (err) {
    console.error("loadBookmarks failed (returning null so the client keeps its last-known state):", err);
    return null;
  }
}

export async function commentPost(postId: string, text: string): Promise<{ ok: boolean; post?: FeedPost }> {
  const u = await me();
  if (!u || !text.trim()) return { ok: false };
  if (usesDb(u.id)) {
    const res = await fdb.addComment(u.id, postId, text);
    if (!res) return { ok: false };
    if (res.authorId !== u.id) {
      await notify(res.authorId, {
        type: "comment",
        actorId: u.id,
        actorName: u.name,
        body: `${u.name} commented: "${text.trim().slice(0, 60)}"`,
        href: "home",
      });
    }
    return { ok: true };
  }
  const post = mem.addComment(u.id, postId, text);
  if (post && post.authorId !== u.id) {
    await notify(post.authorId, {
      type: "comment",
      actorId: u.id,
      actorName: u.name,
      body: `${u.name} commented: "${text.trim().slice(0, 60)}"`,
      href: "home",
    });
  }
  return post ? { ok: true, post } : { ok: false };
}

/* ------------------------------- stories ------------------------------- */

export async function loadStories(): Promise<StoryDTO[]> {
  const u = await me();
  if (!u || !usesDb(u.id)) return [];
  try {
    return await fdb.listStories(u.id);
  } catch (err) {
    console.error("loadStories failed:", err);
    return [];
  }
}

export async function publishStory(media: string, caption?: string): Promise<{ ok: boolean; error?: string }> {
  const u = await me();
  if (!u) return { ok: false, error: "Sign in to post a status." };
  if (!media.startsWith("data:image/") || media.length > 1_500_000) {
    return { ok: false, error: "That image is too large." };
  }
  if (!usesDb(u.id)) return { ok: false, error: "Status posts are for registered members." };
  await fdb.addStory(u.id, media, caption);
  return { ok: true };
}
