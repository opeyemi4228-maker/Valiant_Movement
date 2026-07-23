"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
  ImageIcon,
  Globe2,
  Radio,
  Send,
  BadgeCheck,
  X,
  Sparkles,
  Plus,
  TrendingUp,
  Users,
  Video,
  MapPin,
  CalendarDays,
  ChevronRight,
  Bookmark,
  MoreHorizontal,
  Smile,
} from "lucide-react";
import { loadFeedBundle, publishPost, likePost, repostPost, commentPost, bookmarkPost, publishStory } from "@/app/actions/feed";
import type { StoryDTO } from "@/lib/feed-db";
import type { FeedPost } from "@/lib/feed-types";
import { CallRoom, type CallConfig } from "@/components/call/CallRoom";
import { people, trends, suggestedPeople } from "@/data/community";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Avatar } from "./Avatar";

function fmt(n: number) {
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

const QUICK: { label: string; template: string }[] = [
  { label: "🎉 Share a win", template: "🎉 Sharing a win — " },
  { label: "🏆 Post a milestone", template: "🏆 Milestone unlocked: " },
  { label: "📣 Rally support", template: "📣 Rallying support — we need help with " },
  { label: "💬 Ask the movement", template: "💬 Question for the movement: " },
];

/* --------------------------------- Feed --------------------------------- */

export function LiveFeed({ me, active = true }: { me: { name: string; avatar?: string }; active?: boolean }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [story, setStory] = useState<number | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [myStory, setMyStory] = useState<{ media: string; caption: string } | null>(null); // demo fallback
  const [dbStories, setDbStories] = useState<StoryDTO[]>([]);
  const [storyImg, setStoryImg] = useState<string | null>(null); // create-story preview
  const [storyCaption, setStoryCaption] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null); // focused single-post view
  const fileRef = useRef<HTMLInputElement>(null);
  const storyFileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollTopRef = useRef<HTMLDivElement>(null);
  const firstName = me.name.split(/\s+/)[0];

  // Stories: real 24-hour member statuses (from the DB) lead; the showcase
  // rail fills in behind them. Your own story (if live) is always first.
  const peopleStories: Story[] = STORY_PEOPLE.map((p, i) => ({
    key: p.id,
    name: p.name,
    person: p,
    media: STORY_MEDIA[i % STORY_MEDIA.length],
    caption: `${p.role} · ${p.location}`,
  }));
  const realStories: Story[] = dbStories.map((s) => ({
    key: s.id,
    name: s.mine ? "You" : s.name,
    media: s.media,
    caption: s.caption ?? "",
  }));
  const localMine: Story[] =
    myStory && !dbStories.some((s) => s.mine)
      ? [{ key: "me", name: "You", media: myStory.media, caption: myStory.caption }]
      : [];
  const stories: Story[] = [...localMine, ...realStories, ...peopleStories];
  const hasMyStory = localMine.length > 0 || dbStories.some((s) => s.mine);

  async function onPickStory(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setStoryImg(await readImage(f));
    setStoryCaption("");
  }

  function pickTag(tag: string) {
    setActiveTag(tag);
    requestAnimationFrame(() =>
      scrollTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const visiblePosts = activeTag
    ? posts.filter((p) => p.text.toLowerCase().includes(activeTag.toLowerCase()))
    : posts;

  // Single-flight: if a poll tick and a manual refresh (e.g. right after
  // posting) land at the same time, they share one network round trip
  // instead of stacking two — this is what kept polls from piling up faster
  // than they could drain, which used to make the whole app feel minutes
  // behind under load.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const refresh = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    const p = (async () => {
      try {
        const res = await loadFeedBundle();
        setPosts(res.posts);
        setDbStories(res.stories);
        setLoaded(true);
      } catch {
        /* transient — the next poll recovers */
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    // Paused while another tab is active — this component stays mounted
    // (so switching back is instant) but its background poll stands down;
    // reactivating re-fires immediately below so the view is never stale.
    if (!active) return;
    const kick = setTimeout(refresh, 0); // after paint — no sync setState in the effect
    const t = setInterval(refresh, 750); // tightened again — 2x faster
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [refresh, active]);

  function upsert(post: FeedPost) {
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
  }

  async function onPublish() {
    const text = draft.trim();
    if ((!text && !image) || posting) return;
    setPosting(true);
    const res = await publishPost(text, image ?? undefined);
    if (res.ok) {
      setDraft("");
      setImage(null);
      await refresh(); // the persisted post comes straight back from the DB
    }
    setPosting(false);
  }

  async function onLike(id: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p)),
    );
    const res = await likePost(id);
    if (res.ok && res.post) upsert(res.post); // demo returns the post; DB reconciles on poll
  }

  async function onRepost(id: string) {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, reposted: !p.reposted, reposts: p.reposts + (p.reposted ? -1 : 1) } : p)),
    );
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

  async function onBookmark(id: string) {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, bookmarked: !p.bookmarked } : p)));
    const res = await bookmarkPost(id);
    if (res.ok) {
      if (res.post) upsert(res.post);
      else setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, bookmarked: !!res.bookmarked } : p)));
    }
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(f);
  }

  const focusPost = focusId ? posts.find((p) => p.id === focusId) ?? null : null;

  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      {/* Focused single-post view — just this post and its conversation */}
      {focusPost && (
        <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-6">
          <div className="absolute inset-0" onClick={() => setFocusId(null)} />
          <div className="relative my-auto w-full max-w-[640px]">
            <button
              onClick={() => setFocusId(null)}
              aria-label="Close post"
              className="absolute -top-2 right-0 z-10 grid size-9 -translate-y-full place-items-center rounded-full bg-white text-[var(--color-ink)] shadow-lg transition hover:bg-[var(--color-surface-2)]"
            >
              <X className="h-4 w-4" />
            </button>
            <PostCard post={focusPost} me={me} onLike={onLike} onRepost={onRepost} onComment={onComment} onBookmark={onBookmark} expanded />
          </div>
        </div>
      )}
      {story !== null && (
        <StoryViewer stories={stories} start={story} onClose={() => setStory(null)} />
      )}
      {storyImg && (
        <StoryComposer
          image={storyImg}
          caption={storyCaption}
          onCaption={setStoryCaption}
          onCancel={() => { setStoryImg(null); setStoryCaption(""); }}
          onShare={async () => {
            const caption = storyCaption.trim() || "Courage to lead. 🦅 #ValiantMovement";
            const media = storyImg;
            setStoryImg(null);
            setStoryCaption("");
            // Persist (24-hour lifetime, visible to every member). Demo
            // sessions fall back to a local story.
            const res = await publishStory(media, caption);
            if (res.ok) await refresh();
            else setMyStory({ media, caption });
            setStory(0); // play it back immediately
          }}
        />
      )}
      <input ref={storyFileRef} type="file" accept="image/*" hidden onChange={onPickStory} />

      <div className="flex w-full gap-6 px-3 py-4 sm:px-5 lg:px-6 xl:gap-8 xl:px-8">
        {/* ============================ Center feed ============================ */}
        <div className="mx-auto w-full min-w-0 max-w-[680px] flex-1 xl:mx-0 xl:max-w-none">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">The Movement</h1>
              <p className="text-[13px] text-[var(--color-muted)]">Live across the federation</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-green)]/30 bg-[var(--color-green)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--color-green)]">
              <Radio className="h-3 w-3" /> Live
            </span>
          </div>

          {/* Stories */}
          <Stories
            me={me}
            hasMyStory={hasMyStory}
            onView={setStory}
            onCreate={() => storyFileRef.current?.click()}
          />

          {/* Composer */}
          <div className="mt-3 rounded-2xl border border-[var(--color-line)] bg-white p-3.5">
            <div className="flex gap-3">
              <Avatar name={me.name} color="#e07400" photo={me.avatar} size={42} />
              <div className="min-w-0 flex-1">
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Share something with the movement, ${firstName}…`}
                  rows={draft || image ? 3 : 1}
                  className="w-full resize-none bg-transparent pt-2 text-[15px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
                />
                {image && (
                  <div className="relative mt-2 w-fit">
                    <img src={image} alt="" className="max-h-52 rounded-xl border border-[var(--color-line)]" />
                    <button
                      onClick={() => setImage(null)}
                      className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {!draft && !image && (
                  <div className="no-scrollbar -mx-1 mt-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {QUICK.map((q) => (
                      <button
                        key={q.label}
                        onClick={() => {
                          setDraft(q.template);
                          requestAnimationFrame(() => composerRef.current?.focus());
                        }}
                        className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[12px] font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)]"
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between border-t border-[var(--color-line-soft)] pt-2.5">
                  <div className="relative flex items-center gap-1">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-[var(--color-brand-strong)] transition hover:bg-[var(--color-brand-tint)]"
                    >
                      <ImageIcon className="h-[18px] w-[18px]" /> Photo
                    </button>
                    <button
                      onClick={() => setShowEmoji((v) => !v)}
                      className={`grid size-8 place-items-center rounded-lg transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-brand-strong)] ${showEmoji ? "text-[var(--color-brand-strong)]" : "text-[var(--color-muted)]"}`}
                      title="Add emoji"
                    >
                      <Smile className="h-[18px] w-[18px]" />
                    </button>
                    {showEmoji && (
                      <EmojiPicker
                        onPick={(e) => setDraft((d) => d + e)}
                        onClose={() => setShowEmoji(false)}
                      />
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
                  <button
                    onClick={onPublish}
                    disabled={(!draft.trim() && !image) || posting}
                    className="rounded-full gradient-brand px-5 py-2 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {posting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Posts */}
          <div ref={scrollTopRef} className="mt-3 space-y-3 pb-10">
            {activeTag && (
              <div className="flex items-center justify-between rounded-2xl border border-[var(--color-line)] bg-white px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-[var(--color-brand-strong)]" />
                  <span className="font-bold text-[var(--color-brand-strong)]">{activeTag}</span>
                  <span className="text-[var(--color-muted)]">· {visiblePosts.length} post{visiblePosts.length === 1 ? "" : "s"}</span>
                </div>
                <button
                  onClick={() => setActiveTag(null)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
                >
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            )}
            {!loaded && (
              <>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-[var(--color-line)] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span className="size-11 shrink-0 rounded-full bg-[var(--color-surface-2)]" />
                      <div className="min-w-0 flex-1 space-y-2.5 pt-1">
                        <div className="h-3.5 w-40 rounded-full bg-[var(--color-surface-2)]" />
                        <div className="h-3 w-full rounded-full bg-[var(--color-surface-2)]" />
                        <div className="h-3 w-4/5 rounded-full bg-[var(--color-surface-2)]" />
                        {i === 1 && <div className="h-40 w-full rounded-xl bg-[var(--color-surface-2)]" />}
                        <div className="flex gap-6 pt-1">
                          <div className="h-3 w-10 rounded-full bg-[var(--color-surface-2)]" />
                          <div className="h-3 w-10 rounded-full bg-[var(--color-surface-2)]" />
                          <div className="h-3 w-10 rounded-full bg-[var(--color-surface-2)]" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {loaded && visiblePosts.length === 0 && (
              <div className="grid place-items-center rounded-2xl border border-dashed border-[var(--color-line)] bg-white py-14 text-center">
                <Sparkles className="mb-2 h-7 w-7 text-[var(--color-faint)]" />
                <p className="text-sm text-[var(--color-muted)]">
                  {activeTag ? `No posts yet under ${activeTag}.` : "Be the first to post to the movement."}
                </p>
                {activeTag && (
                  <button
                    onClick={() => {
                      setDraft(activeTag + " ");
                      setActiveTag(null);
                      requestAnimationFrame(() => composerRef.current?.focus());
                    }}
                    className="mt-3 rounded-full gradient-brand px-4 py-2 text-sm font-bold text-white"
                  >
                    Post about {activeTag}
                  </button>
                )}
              </div>
            )}
            {visiblePosts.map((post) => (
              <div
                key={post.id}
                onClick={(e) => {
                  // open the focused view unless an interactive element was hit
                  if ((e.target as HTMLElement).closest("button, a, textarea, input")) return;
                  setFocusId(post.id);
                }}
                className="cursor-pointer"
              >
                <PostCard post={post} me={me} onLike={onLike} onRepost={onRepost} onComment={onComment} onBookmark={onBookmark} />
              </div>
            ))}
            {loaded && visiblePosts.length > 0 && (
              <div className="grid place-items-center py-6 text-sm text-[var(--color-faint)]">
                You&apos;re all caught up 🦅
              </div>
            )}
          </div>
        </div>

        {/* ============================ Right rail ============================ */}
        <aside className="hidden shrink-0 xl:block xl:w-[320px] 2xl:w-[360px]">
          <div className="sticky top-0 space-y-4 pb-10">
            <LiveNow />
            <Trending onPick={pickTag} active={activeTag} />
            <WhoToFollow />
            <NextGathering />
            <p className="px-2 text-[11px] leading-relaxed text-[var(--color-faint)]">
              Valiant Movement · Courage to Lead · Every member verified by NIN.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------- Stories -------------------------------- */

const STORY_MEDIA = [
  "/highlights/02-movement.jpg",
  "/highlights/04-gather.jpg",
  "/highlights/03-recognition.jpg",
  "/highlights/05-lead.jpg",
  "/highlights/01-voice.jpg",
  "/highlights/06-serve.jpg",
];

const STORY_PEOPLE = people.filter((p) => p.photo).slice(0, 6);

type Story = {
  key: string;
  name: string;
  media: string;
  caption: string;
  person?: (typeof people)[number];
};

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function Stories({
  me,
  hasMyStory,
  onView,
  onCreate,
}: {
  me: { name: string; avatar?: string };
  hasMyStory: boolean;
  onView: (i: number) => void;
  onCreate: () => void;
}) {
  // When you've posted a story it leads the list (index 0); friends shift by 1.
  const offset = hasMyStory ? 1 : 0;
  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 py-1">
      {/* Your story */}
      <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
        <div className="relative size-16">
          <button
            onClick={() => (hasMyStory ? onView(0) : onCreate())}
            title={hasMyStory ? "View your story" : "Add to your story"}
            className="size-16"
          >
            {hasMyStory ? (
              <span className="block rounded-full bg-gradient-to-tr from-[var(--color-brand)] via-[#f25fb0] to-[var(--color-amber)] p-[2.5px]">
                <span className="block rounded-full bg-white p-[2px]">
                  <Avatar name={me.name} color="#e07400" photo={me.avatar} size={52} />
                </span>
              </span>
            ) : (
              <span className="grid size-16 place-items-center rounded-full bg-[var(--color-surface-2)] ring-2 ring-[var(--color-line)]">
                <Avatar name={me.name} color="#e07400" photo={me.avatar} size={56} />
              </span>
            )}
          </button>
          <button
            onClick={onCreate}
            title="Add to your story"
            className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-white bg-[var(--color-brand)] text-white transition hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="w-full truncate text-center text-[11px] font-medium text-[var(--color-muted)]">Your story</span>
      </div>

      {STORY_PEOPLE.map((p, i) => (
        <button key={p.id} onClick={() => onView(offset + i)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <span className="rounded-full bg-gradient-to-tr from-[var(--color-brand)] via-[#f25fb0] to-[var(--color-amber)] p-[2.5px]">
            <span className="block rounded-full bg-white p-[2px]">
              <Avatar person={p} size={52} />
            </span>
          </span>
          <span className="w-full truncate text-center text-[11px] font-medium text-[var(--color-ink-soft)]">
            {p.name.split(/\s+/)[0]}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ----------------------------- Story composer ---------------------------- */

function StoryComposer({
  image,
  caption,
  onCaption,
  onCancel,
  onShare,
}: {
  image: string;
  caption: string;
  onCaption: (v: string) => void;
  onCancel: () => void;
  onShare: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <h3 className="font-bold text-[var(--color-navy)]">Add to your story</h3>
          <button onClick={onCancel} className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative bg-black">
          <img src={image} alt="" className="max-h-[52vh] w-full object-contain" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            {caption && <p className="text-[15px] font-semibold text-white drop-shadow">{caption}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 p-3">
          <input
            value={caption}
            onChange={(e) => onCaption(e.target.value)}
            placeholder="Add a caption…"
            className="h-11 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 text-[15px] outline-none transition focus:border-[var(--color-brand)] focus:bg-white"
          />
          <button
            onClick={onShare}
            className="shrink-0 rounded-full gradient-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-95"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

function StoryViewer({ stories, start, onClose }: { stories: Story[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const item = stories[i];

  useEffect(() => {
    const t = setTimeout(() => {
      if (i < stories.length - 1) setI((v) => v + 1);
      else onClose();
    }, 4200);
    return () => clearTimeout(t);
  }, [i, onClose, stories.length]);

  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/90 backdrop-blur-sm">
      <div className="relative h-full max-h-[90vh] w-full max-w-[440px] overflow-hidden rounded-2xl bg-black">
        {/* progress bars */}
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
          {stories.map((_, k) => (
            <span key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                className="block h-full rounded-full bg-white"
                style={{ width: k < i ? "100%" : k === i ? "100%" : "0%", transition: k === i ? "width 4.2s linear" : undefined }}
              />
            </span>
          ))}
        </div>
        {/* header */}
        <div className="absolute inset-x-3 top-7 z-10 flex items-center gap-2 pt-2">
          {item.person ? (
            <Avatar person={item.person} size={34} ring />
          ) : (
            <Avatar name={item.name} color="#e07400" size={34} ring />
          )}
          <span className="text-sm font-bold text-white drop-shadow">{item.name}</span>
          <span className="text-xs text-white/70">· story</span>
          <button onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-full bg-white/15 text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <img src={item.media} alt="" className="size-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5">
          <p className="text-[15px] font-semibold text-white drop-shadow">{item.caption}</p>
          <p className="mt-0.5 text-sm text-white/80">Courage to lead. 🦅 #ValiantMovement</p>
        </div>
        {/* tap zones */}
        <button aria-label="Previous" onClick={() => setI((v) => Math.max(0, v - 1))} className="absolute inset-y-0 left-0 w-1/3" />
        <button aria-label="Next" onClick={() => (i < stories.length - 1 ? setI((v) => v + 1) : onClose())} className="absolute inset-y-0 right-0 w-1/3" />
      </div>
    </div>
  );
}

/* ------------------------------- Post card ------------------------------- */

export function PostCard({
  post,
  me,
  onLike,
  onRepost,
  onComment,
  onBookmark,
  expanded = false,
}: {
  post: FeedPost;
  me: { name: string; avatar?: string };
  onLike: (id: string) => void;
  onRepost: (id: string) => void;
  onComment: (id: string, text: string) => void;
  onBookmark: (id: string) => void;
  /** Focused single-post view — the conversation is open from the start. */
  expanded?: boolean;
}) {
  const [open, setOpen] = useState(expanded);
  const [comment, setComment] = useState("");
  const [burst, setBurst] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  function submitComment() {
    const t = comment.trim();
    if (!t) return;
    onComment(post.id, t);
    setComment("");
    setShowEmoji(false);
    setOpen(true);
  }

  function doubleTapLike() {
    if (!post.liked) onLike(post.id);
    setBurst(true);
    setTimeout(() => setBurst(false), 800);
  }

  return (
    <article
      className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white transition hover:shadow-md"
      style={{ borderLeft: `3px solid ${post.authorColor}` }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Avatar name={post.authorName} color={post.authorColor} photo={post.authorPhoto} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-bold text-[var(--color-ink)]">{post.authorName}</span>
              <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--color-brand)]" />
              <span className="text-[12px] text-[var(--color-faint)]">· {timeAgo(post.at)}</span>
            </div>
            {post.community && (
              <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--color-brand-strong)]">
                <Globe2 className="h-3 w-3" /> {post.community}
              </span>
            )}
          </div>
          <button className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[var(--color-surface-2)]">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {post.text && (
          <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-ink-soft)]">{post.text}</p>
        )}
      </div>

      {post.image && (
        <div
          className="relative -mt-1 select-none overflow-hidden border-y border-[var(--color-line-soft)]"
          onDoubleClick={doubleTapLike}
        >
          <img src={post.image} alt="" className="max-h-[460px] w-full object-cover" />
          {burst && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <Heart className="animate-pop h-24 w-24 fill-white text-white drop-shadow-lg" />
            </span>
          )}
        </div>
      )}

      <div className="px-4 pb-4 pt-3">
        {/* like count line */}
        {post.likes > 0 && (
          <p className="mb-1.5 text-[13px] font-semibold text-[var(--color-ink)]">
            {fmt(post.likes)} {post.likes === 1 ? "person supports" : "people support"} this
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onLike(post.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition ${
              post.liked ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]" : "text-[var(--color-muted)] hover:bg-[var(--color-danger)]/8 hover:text-[var(--color-danger)]"
            }`}
          >
            <Heart className={`h-[17px] w-[17px] ${post.liked ? "fill-current" : ""}`} /> {fmt(post.likes)}
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-[var(--color-muted)] transition hover:bg-[#0ea5e9]/8 hover:text-[#0ea5e9]"
          >
            <MessageCircle className="h-[17px] w-[17px]" /> {fmt(post.comments.length)}
          </button>
          <button
            onClick={() => onRepost(post.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition ${
              post.reposted ? "bg-[var(--color-green)]/10 text-[var(--color-green)]" : "text-[var(--color-muted)] hover:bg-[var(--color-green)]/8 hover:text-[var(--color-green)]"
            }`}
          >
            <Repeat2 className="h-[17px] w-[17px]" /> {fmt(post.reposts)}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => onBookmark(post.id)}
            title={post.bookmarked ? "Saved — tap to remove" : "Save to bookmarks"}
            aria-pressed={post.bookmarked}
            className={`grid size-8 place-items-center rounded-full transition ${
              post.bookmarked
                ? "bg-[var(--color-brand)]/10 text-[var(--color-brand-strong)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-brand)]/8 hover:text-[var(--color-brand-strong)]"
            }`}
          >
            <Bookmark className={`h-[17px] w-[17px] ${post.bookmarked ? "fill-current" : ""}`} />
          </button>
          <button className="grid size-8 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
            <Share2 className="h-[17px] w-[17px]" />
          </button>
        </div>

        {/* Comments */}
        {(open || post.comments.length > 0) && (
          <div className="mt-3 border-t border-[var(--color-line-soft)] pt-3">
            <div className="space-y-2.5">
              {post.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar name={c.authorName} color={c.authorColor} photo={c.authorPhoto} size={30} />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-[var(--color-surface-2)] px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-[var(--color-ink)]">{c.authorName}</span>
                      <span className="text-[10px] text-[var(--color-faint)]">{timeAgo(c.at)}</span>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <Avatar name={me.name} color="#e07400" photo={me.avatar} size={30} />
              <div className="relative flex flex-1 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-1 transition focus-within:border-[var(--color-brand)] focus-within:bg-white">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitComment(); } }}
                  placeholder="Write a comment…"
                  className="h-9 min-w-0 flex-1 rounded-full bg-transparent px-3.5 text-[13.5px] outline-none"
                />
                <button
                  onClick={() => setShowEmoji((v) => !v)}
                  title="Add emoji"
                  className={`grid size-8 shrink-0 place-items-center rounded-full transition hover:text-[var(--color-brand-strong)] ${showEmoji ? "text-[var(--color-brand-strong)]" : "text-[var(--color-muted)]"}`}
                >
                  <Smile className="h-[18px] w-[18px]" />
                </button>
                {showEmoji && (
                  <EmojiPicker
                    onPick={(e) => setComment((c) => c + e)}
                    onClose={() => setShowEmoji(false)}
                    className="left-auto right-0"
                  />
                )}
              </div>
              <button
                onClick={submitComment}
                disabled={!comment.trim()}
                className="grid size-9 shrink-0 place-items-center rounded-full gradient-brand text-white transition enabled:hover:opacity-95 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/* ------------------------------- Right rail ------------------------------ */

function RailCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <h3 className="flex items-center gap-2 px-4 pb-2 pt-3.5 text-[15px] font-extrabold text-[var(--color-navy)]">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function LiveNow() {
  const live = people.filter((p) => p.photo).slice(0, 3);
  return (
    <RailCard title="Live now" icon={<Radio className="h-4 w-4 text-[var(--color-green)]" />}>
      <div className="px-2 pb-2">
        {live.map((p) => (
          <button key={p.id} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--color-surface-2)]">
            <span className="relative">
              <Avatar person={p} size={38} />
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-[var(--color-green)]" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-bold text-[var(--color-ink)]">{p.name}</div>
              <div className="truncate text-[11px] text-[var(--color-faint)]">Hosting · {p.location} room</div>
            </div>
            <span className="rounded-full bg-[var(--color-green)]/12 px-2 py-0.5 text-[10px] font-bold text-[var(--color-green)]">LIVE</span>
          </button>
        ))}
      </div>
    </RailCard>
  );
}

function Trending({ onPick, active }: { onPick: (tag: string) => void; active: string | null }) {
  return (
    <RailCard title="Trending in the movement" icon={<TrendingUp className="h-4 w-4 text-[var(--color-brand-strong)]" />}>
      <div className="pb-2">
        {trends.slice(0, 5).map((t) => (
          <button
            key={t.tag}
            onClick={() => onPick(t.tag)}
            className={`flex w-full items-center justify-between px-4 py-2 text-left transition hover:bg-[var(--color-surface-2)] ${active === t.tag ? "bg-[var(--color-brand-tint)]/50" : ""}`}
          >
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[11px] text-[var(--color-faint)]">{t.scope}</div>
              <div className="truncate text-[14px] font-bold text-[var(--color-brand-strong)]">{t.tag}</div>
              <div className="text-[11px] text-[var(--color-faint)]">{t.posts}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-faint)]" />
          </button>
        ))}
      </div>
    </RailCard>
  );
}

function WhoToFollow() {
  return (
    <RailCard title="Leaders to follow" icon={<Users className="h-4 w-4 text-[var(--color-brand-strong)]" />}>
      <div className="px-2 pb-2">
        {suggestedPeople.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--color-surface-2)]">
            <Avatar person={p} size={40} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1 truncate text-[13px] font-bold text-[var(--color-ink)]">
                {p.name}
                {p.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand)]" />}
              </div>
              <div className="truncate text-[11px] text-[var(--color-faint)]">{p.role} · {p.location}</div>
            </div>
            <FollowButton />
          </div>
        ))}
      </div>
    </RailCard>
  );
}

function FollowButton() {
  const [following, setFollowing] = useState(false);
  return (
    <button
      onClick={() => setFollowing((v) => !v)}
      className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
        following ? "border border-[var(--color-line)] bg-white text-[var(--color-ink-soft)]" : "bg-[var(--color-navy)] text-white hover:opacity-90"
      }`}
    >
      {following ? "Following" : <><Plus className="h-3 w-3" /> Follow</>}
    </button>
  );
}

function NextGathering() {
  const [call, setCall] = useState<CallConfig | null>(null);
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      {call && <CallRoom config={call} onClose={() => setCall(null)} />}
      <div className="relative h-24">
        <img src="/highlights/04-gather.jpg" alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink)]">
          <CalendarDays className="h-3 w-3" /> Sat · 10:00 AM
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-[var(--color-navy)]">Ward 4 Leadership Town Hall</h3>
        <p className="mt-1 flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
          <MapPin className="h-3.5 w-3.5" /> Lagos · 142 going
        </p>
        <button
          onClick={() =>
            setCall({
              mode: "video",
              kind: "meeting",
              title: "Ward 4 Leadership Town Hall",
              subtitle: "Lagos · Ward 04",
              participants: people
                .filter((p) => /lead|coordinator|organizer/i.test(p.role ?? ""))
                .slice(0, 3)
                .map((p) => ({ name: p.name, color: p.color, photo: p.photo, role: p.role })),
            })
          }
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full gradient-brand py-2 text-sm font-bold text-white transition hover:opacity-95"
        >
          <Video className="h-4 w-4" /> Join meeting
        </button>
      </div>
    </div>
  );
}
