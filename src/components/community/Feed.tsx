"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Share2,
  BadgeCheck,
  ImageIcon,
  MapPin,
  Globe2,
  Plus,
  MoreHorizontal,
  ArrowUp,
  Trophy,
  Megaphone,
  Users,
  CalendarDays,
  ShieldCheck,
  Radio,
  Sparkles,
  PartyPopper,
  Video,
} from "lucide-react";
import { CallRoom, type CallConfig } from "@/components/call/CallRoom";
import {
  posts as seedPosts,
  suggestedPeople,
  communities,
  people,
  type Post,
} from "@/data/community";
import { Avatar } from "./Avatar";

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/* ----------------------- real-time incoming posts ----------------------- */

const INCOMING: Omit<Post, "id" | "time" | "fresh">[] = [
  { author: people.find((p) => p.id === "p5")!, community: "Kaduna State Chapter", text: "Just got verified ✅ Officially part of the movement. Who else joined this week?", likes: 38, comments: 6, reposts: 2 },
  { author: people.find((p) => p.id === "p3")!, community: "Anambra · Ward 7", text: "Our ward just crossed 1,000 verified members 🎉 Grassroots organizing works. #CourageToLead", image: "/highlights/04-gather.jpg", likes: 120, comments: 14, reposts: 9, milestone: true },
  { author: people.find((p) => p.id === "p8")!, community: "Youth Vanguard", text: "Volunteering this weekend for the voter education drive. DM me to join the Oyo team 🙌", likes: 64, comments: 11, reposts: 4 },
  { author: people.find((p) => p.id === "p6")!, community: "Imo · Polling Unit 012", text: "Door-to-door, street-by-street. Every single conversation moves us forward.", likes: 51, comments: 7, reposts: 3 },
];

function useRealtimeFeed(initial: Post[]) {
  const [posts, setPosts] = useState<Post[]>(initial);
  const [pending, setPending] = useState<Post[]>([]);
  const incomingIdx = useRef(0);

  useEffect(() => {
    const t = setInterval(() => {
      const tmpl = INCOMING[incomingIdx.current % INCOMING.length];
      incomingIdx.current += 1;
      setPending((prev) => [{ ...tmpl, id: `rt-${Date.now()}`, time: "now" }, ...prev]);
    }, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setPosts((prev) => {
        if (!prev.length) return prev;
        const i = Math.floor(Math.random() * Math.min(prev.length, 4));
        return prev.map((p, j) =>
          j === i ? { ...p, likes: p.likes + Math.floor(Math.random() * 3) + 1, reposts: p.reposts + (Math.random() > 0.7 ? 1 : 0) } : p,
        );
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  function reveal() {
    setPosts((prev) => [...pending.map((p) => ({ ...p, fresh: true })), ...prev]);
    setPending([]);
  }

  return { posts, setPosts, pending, reveal };
}

/* -------------------------------- filters ------------------------------- */

const FILTERS = [
  { id: "all", label: "All", icon: Globe2 },
  { id: "mine", label: "My communities", icon: Users },
  { id: "milestones", label: "Milestones", icon: Trophy },
  { id: "announcements", label: "Announcements", icon: Megaphone },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const PROMPTS = ["🎉 Share a win", "💬 Ask the movement", "🏆 Post a milestone", "📣 Rally support"];

/* --------------------------------- Feed --------------------------------- */

export function Feed({ me }: { me: { name: string } }) {
  const { posts, setPosts, pending, reveal } = useRealtimeFeed(seedPosts);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstName = me.name.split(/\s+/)[0];

  const joined = communities.filter((c) => c.joined);
  const joinedNames = new Set(joined.map((c) => c.name));

  function react(id: string, key: "liked" | "reposted" | "bookmarked") {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const on = !p[key];
        const delta = on ? 1 : -1;
        if (key === "liked") return { ...p, liked: on, likes: p.likes + delta };
        if (key === "reposted") return { ...p, reposted: on, reposts: p.reposts + delta };
        return { ...p, bookmarked: on };
      }),
    );
  }

  function publish() {
    const text = draft.trim();
    if (!text) return;
    const post: Post = {
      id: "draft-" + Date.now(),
      author: { id: "me", name: me.name, handle: me.name.toLowerCase().replace(/\s+/g, "_"), color: "#e07400", verified: true, role: "You" },
      time: "now",
      text,
      likes: 0,
      comments: 0,
      reposts: 0,
      fresh: true,
    };
    setPosts((prev) => [post, ...prev]);
    setDraft("");
    setComposerOpen(false);
  }

  const visible = posts.filter((p) => {
    if (filter === "mine") return p.community ? joinedNames.has(p.community) : false;
    if (filter === "milestones") return p.milestone;
    if (filter === "announcements") return /lead|coordinator|organizer|agent/i.test(p.author.role ?? "");
    return true;
  });

  function revealAndScroll() {
    reveal();
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex h-full w-full">
      {/* ----------------------------- Center column ----------------------------- */}
      <div className="relative flex h-full min-w-0 flex-1 flex-col border-[var(--color-line)] xl:border-r">
        {/* Sticky greeting + filter chips */}
        <div className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-bg)]/85 px-4 pt-4 backdrop-blur-md lg:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-navy)]">
                The Movement
              </h1>
              <p className="text-[13px] text-[var(--color-muted)]">
                What&apos;s happening across the federation
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-green)]/30 bg-[var(--color-green)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--color-green)]">
              <Radio className="h-3 w-3" /> Live
            </span>
          </div>

          <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-3">
            {FILTERS.map((f) => {
              const Icon = f.icon;
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                    active
                      ? "gradient-brand text-white shadow-sm"
                      : "border border-[var(--color-line)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* New posts pill */}
        {pending.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-[118px] z-30 flex justify-center">
            <button
              onClick={revealAndScroll}
              className="animate-pop pointer-events-auto flex items-center gap-2 rounded-full gradient-brand px-4 py-2 text-sm font-bold text-white shadow-lg ring-4 ring-[var(--color-brand)]/15"
            >
              <ArrowUp className="h-4 w-4" />
              {pending.length} new {pending.length === 1 ? "update" : "updates"}
              <span className="flex -space-x-2">
                {pending.slice(0, 3).map((p) => (
                  <Avatar key={p.id} person={p.author} size={20} ring />
                ))}
              </span>
            </button>
          </div>
        )}

        {/* Scroll area */}
        <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 lg:px-4">
          {/* Identity welcome strip */}
          <div className="overflow-hidden rounded-2xl border border-[var(--color-brand)]/20 bg-gradient-to-br from-[var(--color-brand-tint)] to-white p-4">
            <div className="flex items-center gap-3">
              <Avatar name={me.name} color="#e07400" size={46} online />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-bold text-[var(--color-navy)]">Welcome back, {firstName}</span>
                  <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--color-brand)]" />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[var(--color-muted)]">
                  <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-[var(--color-green)]" /> NIN verified</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Lagos · Ward 04</span>
                </div>
              </div>
            </div>
          </div>

          {/* Composer */}
          <div className="rounded-2xl border border-[var(--color-line)] bg-white p-3.5">
            <div className="flex gap-3">
              <Avatar name={me.name} color="#e07400" size={42} />
              <div className="min-w-0 flex-1">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={() => setComposerOpen(true)}
                  placeholder={`Share something with the movement, ${firstName}…`}
                  rows={composerOpen || draft ? 3 : 1}
                  className="w-full resize-none bg-transparent pt-2 text-[15px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
                />
                {(composerOpen || draft) && (
                  <div className="no-scrollbar -mx-1 mt-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setDraft((d) => (d ? d : p.replace(/^\S+\s/, "") + ": "))}
                        className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-[12px] font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-brand-tint)] hover:text-[var(--color-brand-strong)]"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between border-t border-[var(--color-line-soft)] pt-2.5">
                  <button className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-[var(--color-brand-strong)] transition hover:bg-[var(--color-brand-tint)]">
                    <ImageIcon className="h-[18px] w-[18px]" /> Photo
                  </button>
                  <button
                    onClick={publish}
                    disabled={!draft.trim()}
                    className="rounded-full gradient-brand px-5 py-2 text-sm font-bold text-white shadow-sm transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Share
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Posts */}
          {visible.map((post) => (
            <PostCard key={post.id} post={post} onReact={react} />
          ))}

          {visible.length === 0 && (
            <div className="grid place-items-center rounded-2xl border border-dashed border-[var(--color-line)] bg-white py-14 text-center">
              <Sparkles className="mb-2 h-7 w-7 text-[var(--color-faint)]" />
              <p className="text-sm text-[var(--color-muted)]">Nothing here yet for this filter.</p>
            </div>
          )}

          <div className="grid place-items-center py-6 text-sm text-[var(--color-faint)]">
            You&apos;re all caught up 🦅
          </div>
        </div>
      </div>

      {/* ------------------------------- Right rail ------------------------------- */}
      <aside className="no-scrollbar hidden h-full w-[340px] shrink-0 overflow-y-auto px-5 py-4 xl:block">
        <YourMovement joinedCount={joined.length} />
        <NextGathering />
        <CoordinatorsNearYou />
        <p className="px-2 py-4 text-[11px] leading-relaxed text-[var(--color-faint)]">
          Valiant Movement · Courage to Lead · Every member verified by NIN.
        </p>
      </aside>
    </div>
  );
}

/* ------------------------------- Post card ------------------------------- */

function PostCard({ post, onReact }: { post: Post; onReact: (id: string, key: "liked" | "reposted" | "bookmarked") => void }) {
  const accent = post.milestone ? "var(--color-green)" : post.author.color;
  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white transition hover:shadow-md ${
        post.milestone ? "border-[var(--color-green)]/30" : "border-[var(--color-line)]"
      } ${post.fresh ? "animate-rise" : ""}`}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {post.milestone && (
        <div className="flex items-center gap-1.5 bg-[var(--color-green)]/10 px-4 py-1.5 text-[12px] font-bold text-[var(--color-green)]">
          <PartyPopper className="h-3.5 w-3.5" /> Movement milestone
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Avatar person={post.author} size={44} online={post.author.photo ? true : undefined} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-bold text-[var(--color-ink)]">{post.author.name}</span>
              {post.author.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--color-brand)]" />}
              {post.author.role && (
                <span className="hidden rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-muted)] sm:inline">
                  {post.author.role}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--color-faint)]">
              <span>@{post.author.handle}</span>
              <span>· {post.time}</span>
              {post.community && (
                <span className="flex items-center gap-1 font-medium text-[var(--color-brand-strong)]">
                  <Globe2 className="h-3 w-3" /> {post.community}
                </span>
              )}
            </div>
          </div>
          <button className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--color-faint)] transition hover:bg-[var(--color-surface-2)]">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <p className="mt-2.5 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--color-ink-soft)]">{post.text}</p>

        {post.image && (
          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--color-line)]">
            <img src={post.image} alt="" className="max-h-[420px] w-full object-cover" />
          </div>
        )}

        {/* Pill actions */}
        <div className="mt-3.5 flex items-center gap-2">
          <Pill
            icon={<Heart className={`h-[17px] w-[17px] ${post.liked ? "fill-current" : ""}`} />}
            label={fmt(post.likes)}
            active={post.liked}
            activeClass="bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
            hoverClass="hover:bg-[var(--color-danger)]/8 hover:text-[var(--color-danger)]"
            onClick={() => onReact(post.id, "liked")}
            title="Support"
          />
          <Pill
            icon={<MessageCircle className="h-[17px] w-[17px]" />}
            label={fmt(post.comments)}
            hoverClass="hover:bg-[#0ea5e9]/8 hover:text-[#0ea5e9]"
            title="Discuss"
          />
          <Pill
            icon={<Repeat2 className="h-[17px] w-[17px]" />}
            label={fmt(post.reposts)}
            active={post.reposted}
            activeClass="bg-[var(--color-green)]/10 text-[var(--color-green)]"
            hoverClass="hover:bg-[var(--color-green)]/8 hover:text-[var(--color-green)]"
            onClick={() => onReact(post.id, "reposted")}
            title="Amplify"
          />
          <div className="flex-1" />
          <Pill
            icon={<Bookmark className={`h-[17px] w-[17px] ${post.bookmarked ? "fill-current" : ""}`} />}
            active={post.bookmarked}
            activeClass="bg-[var(--color-brand)]/12 text-[var(--color-brand-strong)]"
            hoverClass="hover:bg-[var(--color-brand)]/8 hover:text-[var(--color-brand-strong)]"
            onClick={() => onReact(post.id, "bookmarked")}
            title="Save"
          />
          <Pill
            icon={<Share2 className="h-[17px] w-[17px]" />}
            hoverClass="hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            title="Share"
          />
        </div>
      </div>
    </article>
  );
}

function Pill({
  icon,
  label,
  active,
  activeClass = "",
  hoverClass,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  label?: string;
  active?: boolean;
  activeClass?: string;
  hoverClass: string;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition ${
        active ? activeClass : `text-[var(--color-muted)] ${hoverClass}`
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

/* ------------------------------- Right rail ------------------------------ */

function YourMovement({ joinedCount }: { joinedCount: number }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <div className="gradient-brand p-4 text-white">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4" /> Your movement
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--color-line)] text-center">
        <Mini value={String(joinedCount)} label="Communities" />
        <Mini value="312" label="Following" />
        <Mini value="1.9K" label="Followers" />
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--color-line)] px-4 py-3 text-[13px]">
        <ShieldCheck className="h-4 w-4 text-[var(--color-green)]" />
        <span className="font-semibold text-[var(--color-ink)]">Verified member</span>
        <span className="ml-auto text-[var(--color-faint)]">Lagos · Ward 04</span>
      </div>
    </div>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div className="py-3">
      <div className="text-lg font-extrabold text-[var(--color-navy)]">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
    </div>
  );
}

function NextGathering() {
  const [call, setCall] = useState<CallConfig | null>(null);
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      {call && <CallRoom config={call} onClose={() => setCall(null)} />}
      <div className="relative h-24">
        <img src="/highlights/04-gather.jpg" alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink)]">
          <CalendarDays className="h-3 w-3" /> Sat · 10:00 AM
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[var(--color-green)] px-2 py-0.5 text-[11px] font-bold text-white">
          <Radio className="h-3 w-3" /> Live soon
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-[var(--color-navy)]">Ward 4 Leadership Town Hall</h3>
        <p className="mt-1 flex items-center gap-1 text-[12px] text-[var(--color-muted)]">
          <MapPin className="h-3.5 w-3.5" /> Community Centre, Lagos · 142 going
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

function CoordinatorsNearYou() {
  const coordinators = people.filter((p) => /lead|coordinator|organizer/i.test(p.role ?? "")).slice(0, 3);
  const list = coordinators.length ? coordinators : suggestedPeople;
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
      <h3 className="flex items-center gap-2 px-4 pb-2 pt-4 text-base font-extrabold text-[var(--color-navy)]">
        <Users className="h-4 w-4 text-[var(--color-brand-strong)]" /> Leaders near you
      </h3>
      {list.map((p) => (
        <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--color-surface-2)]">
          <Avatar person={p} size={42} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-1 truncate text-sm font-bold text-[var(--color-ink)]">
              {p.name}
              {p.verified && <BadgeCheck className="h-4 w-4 text-[var(--color-brand)]" />}
            </div>
            <div className="truncate text-xs text-[var(--color-faint)]">{p.role} · {p.location}</div>
          </div>
          <FollowButton />
        </div>
      ))}
    </div>
  );
}

function FollowButton() {
  const [following, setFollowing] = useState(false);
  return (
    <button
      onClick={() => setFollowing((v) => !v)}
      className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
        following ? "border border-[var(--color-line)] bg-white text-[var(--color-ink-soft)]" : "bg-[var(--color-navy)] text-white hover:opacity-90"
      }`}
    >
      {following ? "Following" : <><Plus className="h-3.5 w-3.5" /> Follow</>}
    </button>
  );
}
