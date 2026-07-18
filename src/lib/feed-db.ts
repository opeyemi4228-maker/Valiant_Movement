import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, postReactions, profiles, stories, users } from "@/db/schema";
import type { FeedComment, FeedPost } from "./feed-types";

/* ============================================================
   Postgres-backed feed — posts persist forever, stories for 24
   hours. Replaces the in-memory store for real members, so a
   server restart never deletes anyone's posts again.
   ============================================================ */

const COLORS = ["#e07400", "#1faa59", "#7c3aed", "#0ea5e9", "#e23d4e", "#f5a524", "#0d9488", "#db2777"];
function colorFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

interface AuthorRow {
  name: string | null;
  email: string;
  avatar: string | null;
}
function authorName(a: AuthorRow | undefined): string {
  return a?.name?.trim() || a?.email?.split("@")[0] || "Member";
}

const authorSelect = {
  name: profiles.fullName,
  email: users.email,
  avatar: profiles.avatarUrl,
};

/** Top-level feed, newest first, with the viewer's like/repost state. */
export async function listPosts(meId: string, limit = 100): Promise<FeedPost[]> {
  const rows = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
      body: posts.body,
      media: posts.media,
      likeCount: posts.likeCount,
      replyCount: posts.replyCount,
      repostCount: posts.repostCount,
      createdAt: posts.createdAt,
      ...authorSelect,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(profiles, eq(profiles.userId, posts.authorId))
    .where(isNull(posts.parentId))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // The viewer's reactions + all replies, batched (2 queries, not 2N).
  const [myReactions, replies] = await Promise.all([
    db
      .select({ postId: postReactions.postId, type: postReactions.type })
      .from(postReactions)
      .where(and(inArray(postReactions.postId, ids), eq(postReactions.userId, meId))),
    db
      .select({
        id: posts.id,
        parentId: posts.parentId,
        authorId: posts.authorId,
        body: posts.body,
        createdAt: posts.createdAt,
        ...authorSelect,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .leftJoin(profiles, eq(profiles.userId, posts.authorId))
      .where(inArray(posts.parentId, ids))
      .orderBy(posts.createdAt),
  ]);

  const liked = new Set(myReactions.filter((r) => r.type === "like").map((r) => r.postId));
  const reposted = new Set(myReactions.filter((r) => r.type === "repost").map((r) => r.postId));
  const commentsByPost = new Map<string, FeedComment[]>();
  for (const r of replies) {
    const list = commentsByPost.get(r.parentId!) ?? [];
    list.push({
      id: r.id,
      authorId: r.authorId,
      authorName: authorName(r),
      authorColor: colorFor(r.authorId),
      authorPhoto: r.avatar ?? undefined,
      text: r.body ?? "",
      at: new Date(r.createdAt).toISOString(),
    });
    commentsByPost.set(r.parentId!, list);
  }

  return rows.map((r) => {
    const media = (r.media ?? null) as { image?: string; community?: string } | null;
    return {
      id: r.id,
      authorId: r.authorId,
      authorName: authorName(r),
      authorColor: colorFor(r.authorId),
      authorPhoto: r.avatar ?? undefined,
      text: r.body ?? "",
      image: media?.image,
      community: media?.community,
      at: new Date(r.createdAt).toISOString(),
      likes: r.likeCount,
      liked: liked.has(r.id),
      reposts: r.repostCount,
      reposted: reposted.has(r.id),
      comments: commentsByPost.get(r.id) ?? [],
    };
  });
}

export async function addPost(meId: string, text: string, image?: string): Promise<void> {
  await db.insert(posts).values({
    authorId: meId,
    body: text.trim().slice(0, 4000) || null,
    ...(image ? { media: { image } } : {}),
  });
}

/** Toggle a reaction; single-row atomic counter updates. */
async function toggleReaction(meId: string, postId: string, type: "like" | "repost"): Promise<boolean> {
  const inc =
    type === "like"
      ? { likeCount: sql`${posts.likeCount} + 1` }
      : { repostCount: sql`${posts.repostCount} + 1` };
  const dec =
    type === "like"
      ? { likeCount: sql`greatest(${posts.likeCount} - 1, 0)` }
      : { repostCount: sql`greatest(${posts.repostCount} - 1, 0)` };
  const added = await db
    .insert(postReactions)
    .values({ postId, userId: meId, type })
    .onConflictDoNothing()
    .returning({ postId: postReactions.postId });
  if (added.length) {
    await db.update(posts).set(inc).where(eq(posts.id, postId));
    return true;
  }
  await db
    .delete(postReactions)
    .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, meId), eq(postReactions.type, type)));
  await db.update(posts).set(dec).where(eq(posts.id, postId));
  return false;
}

export async function toggleLike(meId: string, postId: string): Promise<{ liked: boolean; authorId: string } | null> {
  const [p] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!p) return null;
  const liked = await toggleReaction(meId, postId, "like");
  return { liked, authorId: p.authorId };
}

export async function toggleRepost(meId: string, postId: string): Promise<boolean | null> {
  const [p] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!p) return null;
  return toggleReaction(meId, postId, "repost");
}

export async function addComment(
  meId: string,
  postId: string,
  text: string,
): Promise<{ authorId: string } | null> {
  const [parent] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!parent) return null;
  await db.insert(posts).values({ authorId: meId, parentId: postId, body: text.trim().slice(0, 2000) });
  await db.update(posts).set({ replyCount: sql`${posts.replyCount} + 1` }).where(eq(posts.id, postId));
  return { authorId: parent.authorId };
}

/* ------------------------------- stories ------------------------------- */

export interface StoryDTO {
  id: string;
  userId: string;
  mine: boolean;
  name: string;
  avatar: string | null;
  color: string;
  media: string;
  caption: string | null;
  at: string;
}

/** Live stories (last 24h), mine first then newest-first by member. */
export async function listStories(meId: string): Promise<StoryDTO[]> {
  const cutoff = new Date(Date.now() - STORY_TTL_MS);
  // Opportunistic sweep — expired stories are deleted, not just hidden.
  db.delete(stories).where(lt(stories.createdAt, cutoff)).catch(() => {});

  const rows = await db
    .select({
      id: stories.id,
      userId: stories.userId,
      media: stories.media,
      caption: stories.caption,
      createdAt: stories.createdAt,
      ...authorSelect,
    })
    .from(stories)
    .innerJoin(users, eq(users.id, stories.userId))
    .leftJoin(profiles, eq(profiles.userId, stories.userId))
    .where(gt(stories.createdAt, cutoff))
    .orderBy(desc(stories.createdAt))
    .limit(50);

  // one story per member (their latest), mine first
  const seen = new Set<string>();
  const result: StoryDTO[] = [];
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    result.push({
      id: r.id,
      userId: r.userId,
      mine: r.userId === meId,
      name: authorName(r),
      avatar: r.avatar,
      color: colorFor(r.userId),
      media: r.media,
      caption: r.caption,
      at: new Date(r.createdAt).toISOString(),
    });
  }
  return result.sort((a, b) => (a.userId === meId ? -1 : b.userId === meId ? 1 : 0));
}

export async function addStory(meId: string, media: string, caption?: string): Promise<void> {
  await db.insert(stories).values({ userId: meId, media, caption: caption?.trim().slice(0, 140) || null });
}
