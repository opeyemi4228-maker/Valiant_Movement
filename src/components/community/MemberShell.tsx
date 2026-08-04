"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Home,
  Users,
  MessageCircle,
  Wallet,
  Bell,
  Bookmark,
  User,
  LogOut,
  Feather,
  Radio,
  X,
  BadgeCheck,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import type { ActiveHuddleAlert } from "@/app/actions/realtime";
import { LiveFeed } from "./LiveFeed";
import { Communities } from "./Communities";
import { LiveChat } from "./LiveChat";
import { MemberFinance } from "./MemberFinance";
import { Notifications } from "./Notifications";
import { Bookmarks } from "./Bookmarks";
import { Profile } from "./Profile";
import { Avatar } from "./Avatar";
import { RealtimePresence } from "./RealtimePresence";
import { ValiantAILauncher } from "@/components/ai/ValiantAILauncher";
import { CallCenter } from "@/components/call/CallCenter";

type Tab = "home" | "communities" | "messages" | "finance" | "notifications" | "bookmarks" | "profile";

// Badges for communities/messages/notifications are real, live unread
// counts (see valiant:communities-unread / valiant:messages-unread /
// valiant:notif-unread below) — never hardcode a placeholder number here.
const NAV: { id: Tab; label: string; icon: typeof Home; badge?: number }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "communities", label: "Communities", icon: Users },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { id: "profile", label: "Profile", icon: User },
];

const TITLES: Record<Tab, string> = {
  home: "Home",
  communities: "Communities",
  messages: "Messages",
  finance: "Finance",
  notifications: "Notifications",
  bookmarks: "Bookmarks",
  profile: "Profile",
};

/** Primary tabs in the mobile bottom navigation. Kept to five so the expandable
 *  pill never wraps on a phone — Profile is reached via the avatar, Bookmarks
 *  via the drawer. */
const MOBILE_NAV = NAV.slice(0, 5);

/** Desktop console nav, grouped so it reads as a member portal, not a flat
 *  social sidebar. */
const NAV_GROUPS: { label: string; ids: Tab[] }[] = [
  { label: "The Movement", ids: ["home", "communities", "messages"] },
  { label: "Your Space", ids: ["finance", "notifications", "bookmarks", "profile"] },
];

export function MemberShell({
  user,
}: {
  user: { fullName: string | null; email: string; status: string; avatarUrl?: string | null };
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the source of truth for the active tab — read synchronously
  // (not in an effect) so a hard reload lands straight on the tab the user
  // left instead of flashing Home first. This route is already dynamic
  // (session cookies are read server-side), so the server and client agree
  // on searchParams from the first render — no hydration mismatch.
  const initialTab: Tab = (() => {
    const t = searchParams.get("tab") as Tab | null;
    return t && TITLES[t] ? t : "home";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  // Every tab the member has opened this session stays mounted (hidden via
  // CSS instead of unmounted) so switching back is instant — no re-fetch,
  // no skeleton flash. Only the very first visit to a tab pays that cost.
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([initialTab]));
  const [notifUnread, setNotifUnread] = useState(0);
  const [messagesUnread, setMessagesUnread] = useState(0);
  const [communitiesUnread, setCommunitiesUnread] = useState(0);
  const [activeHuddles, setActiveHuddles] = useState<ActiveHuddleAlert[]>([]);
  const [dismissedHuddles, setDismissedHuddles] = useState<Set<string>>(new Set());
  const name = user.fullName ?? "Member";

  // Live nav badges — RealtimePresence broadcasts these unread counts every
  // poll tick; the toast's "open" action jumps to the notifications tab.
  useEffect(() => {
    const onCount = (e: Event) => setNotifUnread((e as CustomEvent<number>).detail ?? 0);
    const onMessagesCount = (e: Event) => setMessagesUnread((e as CustomEvent<number>).detail ?? 0);
    const onCommunitiesCount = (e: Event) => setCommunitiesUnread((e as CustomEvent<number>).detail ?? 0);
    const onHuddles = (e: Event) => setActiveHuddles((e as CustomEvent<ActiveHuddleAlert[]>).detail ?? []);
    const onOpen = () => go("notifications");
    window.addEventListener("valiant:notif-unread", onCount);
    window.addEventListener("valiant:messages-unread", onMessagesCount);
    window.addEventListener("valiant:communities-unread", onCommunitiesCount);
    window.addEventListener("valiant:active-huddles", onHuddles);
    window.addEventListener("valiant:open-notifications", onOpen);
    return () => {
      window.removeEventListener("valiant:notif-unread", onCount);
      window.removeEventListener("valiant:messages-unread", onMessagesCount);
      window.removeEventListener("valiant:communities-unread", onCommunitiesCount);
      window.removeEventListener("valiant:active-huddles", onHuddles);
      window.removeEventListener("valiant:open-notifications", onOpen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shown app-wide except while already on Communities — that tab has its
  // own in-context "Join" banner + row badges, so this would be redundant
  // there. This is what surfaces a live huddle to members on Home,
  // Messages, Finance, etc., who previously had zero visibility into it.
  const huddleAlerts =
    tab === "communities" ? [] : activeHuddles.filter((h) => !dismissedHuddles.has(h.huddleId));
  const handle = "@" + name.toLowerCase().replace(/\s+/g, "_");

  const me = { name, handle, color: "#e07400", email: user.email, avatar: user.avatarUrl ?? undefined };

  function go(t: Tab) {
    setTab(t);
    setVisited((prev) => (prev.has(t) ? prev : new Set(prev).add(t)));
    // Mirror the tab into the URL via the native History API — NOT
    // router.replace(). This route is fully dynamic (session cookies read
    // server-side on every request), so router.replace would re-hit the
    // server on every single tab click, undoing the "instant switch" fix
    // below. history.replaceState updates the URL (and stays in sync with
    // usePathname/useSearchParams) with zero server round-trip.
    const params = new URLSearchParams(searchParams.toString());
    if (t === "home") params.delete("tab");
    else params.set("tab", t);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  // The active bottom-nav tab (−1 when on Profile/Bookmarks, reached elsewhere).
  const activeMobileIndex = MOBILE_NAV.findIndex((n) => n.id === tab);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      {/* App-wide "a huddle is live" banner — visible from any tab except
          Communities (which already has its own in-context join banner).
          Persists until the huddle actually ends; dismissing just hides it
          for this session, it reappears if a NEW huddle starts. */}
      {huddleAlerts.length > 0 && (
        <div className="fixed inset-x-0 top-0 z-[85] flex justify-center px-3 pt-2">
          <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-[var(--color-navy)] px-4 py-2.5 text-white shadow-xl">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-green)]/20 text-[var(--color-green)]">
              <Radio className="h-4 w-4 animate-pulse" />
            </span>
            <button onClick={() => go("communities")} className="min-w-0 flex-1 text-left leading-tight">
              <div className="truncate text-[13.5px] font-bold">
                {huddleAlerts[0].mode === "video" ? "Video" : "Voice"} huddle live · {huddleAlerts[0].communityName}
              </div>
              <div className="truncate text-[11.5px] text-white/70">
                {huddleAlerts[0].count} in the room
                {huddleAlerts.length > 1 ? ` · +${huddleAlerts.length - 1} more live` : ""} — tap to join
              </div>
            </button>
            <button
              onClick={() => setDismissedHuddles((prev) => new Set(prev).add(huddleAlerts[0].huddleId))}
              aria-label="Dismiss"
              className="grid size-7 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ============================ Sidebar (desktop) ============================ */}
      <aside className="hidden w-[88px] shrink-0 flex-col border-r border-[var(--color-line)] bg-white px-2 py-4 lg:flex xl:w-[270px] xl:px-4">
        <SidebarInner
          tab={tab}
          go={go}
          me={me}
          notifCount={notifUnread}
          messagesCount={messagesUnread}
          communitiesCount={communitiesUnread}
        />
      </aside>

      {/* ================================ Main ================================ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar — brand on the left, profile on the right. All
            navigation lives in the bottom tab pill; no drawer needed. */}
        <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-line)] bg-white/85 px-4 backdrop-blur lg:hidden">
          {/* Brand lockup */}
          <button
            onClick={() => go("home")}
            className="flex min-w-0 items-center gap-3 active:scale-[0.98]"
            aria-label="The Valiant Movement — Home"
          >
            <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-black/5">
              <img src="/valiant-logo.png" alt="" className="h-8 w-auto" />
            </span>
            <span className="min-w-0 text-left leading-none">
              <span className="block truncate text-[17px] font-extrabold tracking-tight text-[var(--color-navy)]">
                The Valiant{" "}
                <span className="text-[var(--color-brand-strong)]">Movement</span>
              </span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-faint)]">
                Courage to Lead
              </span>
            </span>
          </button>

          {/* 44px avatar = the minimum comfortable thumb target */}
          <button
            onClick={() => go("profile")}
            className="shrink-0 rounded-full ring-2 ring-[var(--color-brand-tint)] transition active:scale-95"
            aria-label="Profile"
          >
            <Avatar name={name} color="#e07400" photo={me.avatar} size={44} />
          </button>
        </header>

        {/* Content — once a tab has been visited it stays mounted (hidden via
            CSS instead of unmounted) so switching back to it is instant: no
            re-fetch, no skeleton flash. Each panel's own poll pauses while
            hidden and fires immediately the moment it's shown again. */}
        <main className="min-h-0 flex-1 overflow-hidden">
          {visited.has("home") && (
            <div className={tab === "home" ? "h-full" : "hidden"}>
              <LiveFeed me={me} active={tab === "home"} />
            </div>
          )}
          {visited.has("communities") && (
            <div className={tab === "communities" ? "h-full" : "hidden"}>
              <Communities />
            </div>
          )}
          {visited.has("messages") && (
            <div className={tab === "messages" ? "h-full" : "hidden"}>
              <LiveChat active={tab === "messages"} />
            </div>
          )}
          {visited.has("finance") && (
            <div className={tab === "finance" ? "h-full" : "hidden"}>
              <MemberFinance name={name} active={tab === "finance"} />
            </div>
          )}
          {visited.has("notifications") && (
            <div className={tab === "notifications" ? "h-full" : "hidden"}>
              <Notifications title={TITLES.notifications} active={tab === "notifications"} />
            </div>
          )}
          {visited.has("bookmarks") && (
            <div className={tab === "bookmarks" ? "h-full" : "hidden"}>
              <Bookmarks me={me} active={tab === "bookmarks"} />
            </div>
          )}
          {visited.has("profile") && (
            <div className={tab === "profile" ? "h-full" : "hidden"}>
              <Profile user={user} />
            </div>
          )}
        </main>

        {/* Mobile bottom tab bar — expandable pill that reveals the active
            label. Sits in flow so content above it is never covered, with
            safe-area padding for iOS home-indicator devices. */}
        <nav className="grid shrink-0 grid-cols-5 border-t border-[var(--color-line)] bg-white pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:hidden">
          {MOBILE_NAV.map((n, i) => {
            const active = activeMobileIndex === i;
            const badge =
              n.id === "notifications" ? notifUnread
              : n.id === "messages" ? messagesUnread
              : n.id === "communities" ? communitiesUnread
              : 0;
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => go(n.id)}
                aria-label={n.label}
                aria-current={active ? "page" : undefined}
                className="relative flex min-w-0 flex-col items-center gap-1 pb-1.5 pt-2.5 transition-colors"
              >
                {/* active top indicator */}
                <span
                  className={`absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-full transition-colors ${
                    active ? "bg-[var(--color-brand)]" : "bg-transparent"
                  }`}
                />
                <span className="relative">
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.4 : 2}
                    className={active ? "text-[var(--color-brand-strong)]" : "text-[var(--color-muted)]"}
                  />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span
                  className={`max-w-full truncate text-[10px] font-semibold leading-none ${
                    active ? "text-[var(--color-brand-strong)]" : "text-[var(--color-muted)]"
                  }`}
                >
                  {n.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Real-time: incoming-call ringing + new-message notifications */}
      <RealtimePresence />

      {/* Valiant AI — voice + text assistant, available app-wide. Raised on
          the chat tabs (Messages + community group chat) so the orb clears
          the message composer (voice note + send). */}
      <ValiantAILauncher raised={tab === "messages" || tab === "communities"} />

      {/* App-wide calling: rings, waits for pickup, and dings on new messages. */}
      <CallCenter />
    </div>
  );
}

/* ----------------------------- Sidebar inner ----------------------------- */

function SidebarInner({
  tab,
  go,
  me,
  notifCount = 0,
  messagesCount = 0,
  communitiesCount = 0,
  expanded = false,
}: {
  tab: Tab;
  go: (t: Tab) => void;
  me: { name: string; handle: string; email: string; avatar?: string };
  notifCount?: number;
  messagesCount?: number;
  communitiesCount?: number;
  expanded?: boolean;
}) {
  // `expanded` forces labels (mobile drawer). On desktop labels show at xl.
  const labelCls = expanded ? "inline" : "hidden xl:inline";
  return (
    <>
      {/* Brand — logo mark (uncropped, true ratio) + a clean two-line wordmark. */}
      <div className={`mb-3.5 flex items-center gap-2.5 ${expanded ? "" : "justify-center xl:justify-start"}`}>
        <img
          src="/valiant-logo.png"
          alt="Valiant Movement"
          className="h-9 w-auto shrink-0 rounded-md object-contain"
        />
        <div className={`leading-none ${labelCls}`}>
          <div className="text-[17px] font-extrabold tracking-tight text-[var(--color-navy)]">Valiant</div>
          <div className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.24em] text-[var(--color-brand-strong)]">
            Movement
          </div>
        </div>
      </div>

      {/* Member identity card — a civic membership card at the TOP, not an
          @handle chip at the bottom the way X does it. */}
      <div className={`mb-1 flex items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-white p-2.5 shadow-sm ${expanded ? "" : "justify-center xl:justify-start"}`}>
        <div className="relative shrink-0">
          <span className="block rounded-full ring-2 ring-[var(--color-brand)]/25">
            <Avatar name={me.name} color="#e07400" photo={me.avatar} size={42} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full bg-white ring-1 ring-[var(--color-line)]">
            <BadgeCheck className="size-3.5 text-[var(--color-brand)]" />
          </span>
        </div>
        <div className={`min-w-0 flex-1 leading-tight ${labelCls}`}>
          <div className="truncate text-[14px] font-bold text-[var(--color-ink)]">{me.name}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--color-green)]">
            <span className="size-1.5 rounded-full bg-[var(--color-green)]" /> Verified member
          </div>
        </div>
      </div>

      {/* Grouped console nav — section labels + left-accent active state, so it
          reads as a member portal rather than a flat social sidebar. */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_GROUPS.map((grp) => (
          <div key={grp.label}>
            <div className={`px-3 pb-1 pt-3.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-faint)] ${labelCls}`}>
              {grp.label}
            </div>
            {grp.ids.map((id) => {
              const it = NAV.find((n) => n.id === id)!;
              const active = tab === it.id;
              const Icon = it.icon;
              const badge =
                it.id === "notifications" ? notifCount
                : it.id === "messages" ? messagesCount
                : it.id === "communities" ? communitiesCount
                : it.badge;
              return (
                <button
                  key={it.id}
                  onClick={() => go(it.id)}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex w-full items-center gap-3.5 rounded-lg px-3 py-2.5 text-[14.5px] font-semibold transition ${
                    active
                      ? "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
                      : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
                  } ${expanded ? "" : "justify-center xl:justify-start"}`}
                >
                  {active && (
                    <span className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-brand)] ${expanded ? "" : "hidden xl:block"}`} />
                  )}
                  <span className="relative">
                    <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 1.9} />
                    {badge ? (
                      <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold text-white">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    ) : null}
                  </span>
                  <span className={labelCls}>{it.label}</span>
                </button>
              );
            })}
          </div>
        ))}

        {/* Footer — compose, then sign out beneath it */}
        <div className="mt-auto space-y-2 pt-4">
          <button
            onClick={() => go("home")}
            className="flex w-full items-center justify-center gap-2 rounded-xl gradient-brand px-4 py-3 text-[14.5px] font-bold text-white shadow-sm transition hover:opacity-95"
          >
            <Feather className="h-[18px] w-[18px]" />
            <span className={labelCls}>Post an update</span>
          </button>
          <form action={logout}>
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--color-muted)] transition hover:border-[var(--color-danger)]/40 hover:bg-[var(--color-danger)]/5 hover:text-[var(--color-danger)]"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className={labelCls}>Sign out</span>
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
