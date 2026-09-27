"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { loadBookmarks, likePost, repostPost, commentPost, bookmarkPost } from "@/app/actions/feed";
import type { FeedPost } from "@/lib/feed-types";
import { PostCard } from "./LiveFeed";
import { PageHeader } from "./PageHeader";
import { ValiantEmpty, ValiantLoader } from "@/components/ui/valiant";

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
    const t = setInterval(refresh, 6000); // pulled back — reduce database data-transfer load
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
    <div className="pb-fab h-full overflow-y-auto">
      <PageHeader
        title="Bookmarks"
        subtitle="Posts you saved to return to"
        count={loaded ? posts.length : undefined}
      />

      <div className="mx-auto w-full max-w-[640px]">
        {!loaded ? (
          <div className="grid place-items-center py-20">
            <ValiantLoader />
          </div>
        ) : posts.length === 0 ? (
          <ValiantEmpty
            className="py-20"
            icon={<Bookmark className="h-7 w-7" />}
            title="Save posts for later"
            text="Tap the bookmark on any post in Home and it'll wait for you here. Only you can see your bookmarks."
          />
        ) : (
          <div className="bg-white sm:border-x sm:border-[var(--color-line)]">
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
