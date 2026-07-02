"use server";

import { getCurrentUser } from "@/lib/session";
import * as mem from "@/lib/demo-store";
import type { FeedPost } from "@/lib/feed-types";

/* ============================================================
   Live feed — posts, likes, reposts and comments shared via the
   in-memory store, so two signed-in members (across two browser
   profiles on the same dev server) see each other's activity in
   real time. Swap for a `posts` table when the DB is connected.
   ============================================================ */

async function me(): Promise<string | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  mem.ensureMember(u.id, u.fullName ?? "Member");
  return u.id;
}

export async function loadFeed(): Promise<{ available: boolean; posts: FeedPost[] }> {
  const id = await me();
  if (!id) return { available: false, posts: [] };
  return { available: true, posts: mem.listPosts(id) };
}

export async function publishPost(text: string, image?: string): Promise<{ ok: boolean; post?: FeedPost; error?: string }> {
  const id = await me();
  if (!id) return { ok: false, error: "Sign in to post." };
  if (!text.trim() && !image) return { ok: false, error: "empty" };
  return { ok: true, post: mem.addPost(id, text, image) };
}

export async function likePost(postId: string): Promise<{ ok: boolean; post?: FeedPost }> {
  const id = await me();
  if (!id) return { ok: false };
  const post = mem.toggleLike(id, postId);
  return post ? { ok: true, post } : { ok: false };
}

export async function repostPost(postId: string): Promise<{ ok: boolean; post?: FeedPost }> {
  const id = await me();
  if (!id) return { ok: false };
  const post = mem.toggleRepost(id, postId);
  return post ? { ok: true, post } : { ok: false };
}

export async function commentPost(postId: string, text: string): Promise<{ ok: boolean; post?: FeedPost }> {
  const id = await me();
  if (!id) return { ok: false };
  const post = mem.addComment(id, postId, text);
  return post ? { ok: true, post } : { ok: false };
}
