"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { loadBookmarks, likePost, repostPost, commentPost, bookmarkPost } from "@/app/actions/feed";
import type { FeedPost } from "@/lib/feed-types";
import { PostCard } from "./LiveFeed";

/**
 * Bookmarks tab — the member's saved posts. Reuses the feed's PostCard so a
 * saved post behaves identically to the Home feed (like, comment, repost).
 * Un-saving here removes it from the list immediately.
 */
export function Bookmarks({ me, active = true }: { me: { name: string; avatar?: string }; active?: boolean }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    // `null` means every server-side retry was exhausted — keep the current
    // list on screen instead of flashing it empty; the next poll recovers.
    const res = await loadBookmarks();
    if (res) {
      setPosts(res.posts);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Paused while another tab is active — this component stays mounted
    // (so switching back is instant) but its background poll stands down;
    // reactivating re-fires immediately below so the list is never stale.
    if (!active) return;
    const kick = setTimeout(refresh, 0);
    const t = setInterval(refresh, 1500); // tightened — matches the rest of the app's real-time feel
    return () => { clearTimeout(kick); clearInterval(t); };
  }, [refresh, active]);

  function upsert(post: FeedPost) {
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
  }

  async function onLike(id: string) {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p)));
    const res = await likePost(id);
    if (res.ok && res.post) upsert(res.post);
  }

  async function onRepost(id: string) {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, reposted: !p.reposted, reposts: p.reposts + (p.reposted ? -1 : 1) } : p)));
    const res = await repostPost(id);
    if (res.ok && res.post) upsert(res.post);
  }

  async function onComment(id: string, text: string) {
    const res = await commentPost(id, text);
    if (res.ok) {
      if (res.post) upsert(res.post);
      else await refresh();
    }
  }

  // Un-saving removes the post from this list right away.
  async function onBookmark(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    await bookmarkPost(id);
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--color-line)] bg-white/85 px-5 py-3.5 backdrop-blur">
        <Bookmark className="h-5 w-5 text-[var(--color-brand-strong)]" />
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">Bookmarks</h1>
        {loaded && posts.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-brand)] px-1.5 text-[11px] font-bold text-white">
            {posts.length}
          </span>
        )}
      </header>

      <div className="mx-auto w-full max-w-[680px] px-4 py-5">
        {!loaded ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-brand)]" />
          </div>
        ) : posts.length === 0 ? (
          <div className="grid place-items-center px-6 py-20 text-center">
            <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-[var(--color-brand-tint)]">
              <Bookmark className="h-7 w-7 text-[var(--color-brand-strong)]" />
            </div>
            <h2 className="text-lg font-bold text-[var(--color-navy)]">Save posts for later</h2>
            <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">
              Tap the bookmark icon on any post in your Home feed and it&apos;ll show up here — only you can see your bookmarks.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                me={me}
                onLike={onLike}
                onRepost={onRepost}
                onComment={onComment}
                onBookmark={onBookmark}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
