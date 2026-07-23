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
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { ExpandableTabs } from "@/components/ui/expandable-tabs";
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
const MOBILE_TABS = MOBILE_NAV.map((n) => ({
  title: n.label,
  icon: n.icon,
  badge: n.badge,
}));

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
  const name = user.fullName ?? "Member";

  // Live nav badges — RealtimePresence broadcasts these unread counts every
  // poll tick; the toast's "open" action jumps to the notifications tab.
  useEffect(() => {
    const onCount = (e: Event) => setNotifUnread((e as CustomEvent<number>).detail ?? 0);
    const onMessagesCount = (e: Event) => setMessagesUnread((e as CustomEvent<number>).detail ?? 0);
    const onCommunitiesCount = (e: Event) => setCommunitiesUnread((e as CustomEvent<number>).detail ?? 0);
    const onOpen = () => go("notifications");
    window.addEventListener("valiant:notif-unread", onCount);
    window.addEventListener("valiant:messages-unread", onMessagesCount);
    window.addEventListener("valiant:communities-unread", onCommunitiesCount);
    window.addEventListener("valiant:open-notifications", onOpen);
    return () => {
      window.removeEventListener("valiant:notif-unread", onCount);
      window.removeEventListener("valiant:messages-unread", onMessagesCount);
      window.removeEventListener("valiant:communities-unread", onCommunitiesCount);
      window.removeEventListener("valiant:open-notifications", onOpen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  // Keep the active tab highlighted/expanded in the bottom pill. Tabs reached
  // elsewhere (profile, bookmarks) collapse the pill to plain icons.
  const activeMobileIndex = MOBILE_NAV.findIndex((n) => n.id === tab);

  function onMobileNav(index: number | null) {
    if (index == null) return;
    go(MOBILE_NAV[index].id);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
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
        <div className="shrink-0 border-t border-[var(--color-line)] bg-white px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:hidden">
          <ExpandableTabs
            tabs={MOBILE_TABS.map((t, i) => {
              const id = MOBILE_NAV[i].id;
              const badge =
                id === "notifications" ? notifUnread
                : id === "messages" ? messagesUnread
                : id === "communities" ? communitiesUnread
                : t.badge;
              return { ...t, badge: badge || undefined };
            })}
            selected={activeMobileIndex >= 0 ? activeMobileIndex : null}
            onChange={onMobileNav}
            activeColor="text-[var(--color-brand-strong)]"
            className="mx-auto w-fit max-w-full flex-nowrap justify-center gap-1 rounded-full border-[var(--color-line)] bg-[var(--color-surface-2)] p-1.5"
          />
        </div>
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
      {/* Brand */}
      <div className={`mb-4 flex items-center gap-2.5 px-1 ${expanded ? "" : "justify-center xl:justify-start"}`}>
        <span className="inline-flex bg-white p-1 ring-1 ring-black/5">
          <img src="/valiant-logo.png" alt="Valiant Movement" className="h-8 w-auto" />
        </span>
        <div className={`leading-tight ${labelCls}`}>
          <div className="text-[14px] font-extrabold tracking-tight text-[var(--color-navy)]">
            Valiant
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-brand-strong)]">
            Movement
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = tab === item.id;
          const Icon = item.icon;
          const badge =
            item.id === "notifications" ? notifCount
            : item.id === "messages" ? messagesCount
            : item.id === "communities" ? communitiesCount
            : item.badge;
          return (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`group relative flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
                active
                  ? "bg-[var(--color-brand-tint)] text-[var(--color-brand-strong)]"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
              } ${expanded ? "" : "justify-center xl:justify-start"}`}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.9} />
                {badge ? (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </span>
              <span className={labelCls}>{item.label}</span>
              {active && (
                <span className={`ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] ${labelCls}`} />
              )}
            </button>
          );
        })}

        {/* Post CTA */}
        <button
          onClick={() => go("home")}
          className="mt-3 flex items-center justify-center gap-2 rounded-full gradient-brand px-4 py-3 text-[15px] font-bold text-white shadow-sm transition hover:opacity-95"
        >
          <Feather className="h-5 w-5" />
          <span className={labelCls}>Create post</span>
        </button>
      </nav>

      {/* User chip + sign out */}
      <div className="mt-3 border-t border-[var(--color-line)] pt-3">
        <div className={`flex items-center gap-3 rounded-xl px-2 py-2 ${expanded ? "" : "justify-center xl:justify-start"}`}>
          <Avatar name={me.name} color="#e07400" photo={me.avatar} size={38} />
          <div className={`min-w-0 flex-1 leading-tight ${labelCls}`}>
            <div className="truncate text-sm font-semibold text-[var(--color-ink)]">{me.name}</div>
            <div className="truncate text-xs text-[var(--color-faint)]">{me.handle}</div>
          </div>
          <form action={logout} className={labelCls}>
            <button
              className="grid size-8 place-items-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
