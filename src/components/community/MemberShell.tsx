"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
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
  Menu,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { ExpandableTabs } from "@/components/ui/expandable-tabs";
import { LiveFeed } from "./LiveFeed";
import { Communities } from "./Communities";
import { LiveChat } from "./LiveChat";
import { MemberFinance } from "./MemberFinance";
import { Notifications } from "./Notifications";
import { Profile } from "./Profile";
import { Avatar } from "./Avatar";
import { RealtimePresence } from "./RealtimePresence";
import { ValiantAILauncher } from "@/components/ai/ValiantAILauncher";
import { CallCenter } from "@/components/call/CallCenter";

type Tab = "home" | "communities" | "messages" | "finance" | "notifications" | "bookmarks" | "profile";

const NAV: { id: Tab; label: string; icon: typeof Home; badge?: number }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "communities", label: "Communities", icon: Users, badge: 17 },
  { id: "messages", label: "Messages", icon: MessageCircle, badge: 11 },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "notifications", label: "Notifications", icon: Bell, badge: 4 },
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
  user: { fullName: string | null; email: string; status: string };
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [mobileNav, setMobileNav] = useState(false);
  const name = user.fullName ?? "Member";
  const handle = "@" + name.toLowerCase().replace(/\s+/g, "_");

  const me = { name, handle, color: "#e07400", email: user.email };

  function go(t: Tab) {
    setTab(t);
    setMobileNav(false);
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
        <SidebarInner tab={tab} go={go} me={me} />
      </aside>

      {/* ============================ Sidebar (mobile drawer) ============================ */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNav(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] flex-col border-r border-[var(--color-line)] bg-white px-4 py-4">
            <SidebarInner tab={tab} go={go} me={me} expanded />
          </aside>
        </div>
      )}

      {/* ================================ Main ================================ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-white/85 px-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobileNav(true)}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-2)] active:scale-95"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Brand lockup */}
          <button
            onClick={() => go("home")}
            className="flex min-w-0 items-center gap-2.5 px-1"
            aria-label="The Valiant Movement — Home"
          >
            <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm ring-1 ring-black/5">
              <img src="/valiant-logo.png" alt="" className="h-6 w-auto" />
            </span>
            <span className="min-w-0 text-left leading-none">
              <span className="block truncate text-[15px] font-extrabold tracking-tight text-[var(--color-navy)]">
                The Valiant{" "}
                <span className="text-[var(--color-brand-strong)]">Movement</span>
              </span>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-faint)]">
                Courage to Lead
              </span>
            </span>
          </button>

          <button
            onClick={() => go("profile")}
            className="shrink-0 rounded-full ring-2 ring-[var(--color-brand-tint)] transition active:scale-95"
            aria-label="Profile"
          >
            <Avatar name={name} color="#e07400" size={36} />
          </button>
        </header>

        {/* Content */}
        <main className="min-h-0 flex-1 overflow-hidden">
          {tab === "home" && <LiveFeed me={me} />}
          {tab === "communities" && <Communities />}
          {tab === "messages" && <LiveChat />}
          {tab === "finance" && <MemberFinance name={name} />}
          {tab === "notifications" && <Notifications title={TITLES.notifications} />}
          {tab === "bookmarks" && <Notifications title={TITLES.bookmarks} bookmarks />}
          {tab === "profile" && <Profile user={user} />}
        </main>

        {/* Mobile bottom tab bar — expandable pill that reveals the active
            label. Sits in flow so content above it is never covered, with
            safe-area padding for iOS home-indicator devices. */}
        <div className="shrink-0 border-t border-[var(--color-line)] bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
          <ExpandableTabs
            tabs={MOBILE_TABS}
            selected={activeMobileIndex >= 0 ? activeMobileIndex : null}
            onChange={onMobileNav}
            activeColor="text-[var(--color-brand-strong)]"
            className="mx-auto w-fit max-w-full flex-nowrap justify-center rounded-full border-[var(--color-line)] bg-[var(--color-surface-2)]"
          />
        </div>
      </div>

      {/* Real-time: incoming-call ringing + new-message notifications */}
      <RealtimePresence />

      {/* Valiant AI — voice + text assistant, available app-wide. Raised on the
          chat tab so the orb clears the message composer (voice note + send). */}
      <ValiantAILauncher raised={tab === "messages"} />

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
  expanded = false,
}: {
  tab: Tab;
  go: (t: Tab) => void;
  me: { name: string; handle: string; email: string };
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
                {item.badge ? (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold text-white">
                    {item.badge > 9 ? "9+" : item.badge}
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
          <Avatar name={me.name} color="#e07400" size={38} />
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
