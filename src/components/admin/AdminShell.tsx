"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Bell, LogOut, Menu, Search, X } from "lucide-react";
import { logoutAdmin } from "@/app/actions/auth";
import { AdminSidebar } from "@/components/ui/sidebar-component";
import { DashboardOverview } from "./DashboardOverview";
import { MembersDatabase } from "./MembersDatabase";
import { AdminCommunity } from "./AdminCommunity";
import { FinanceModule } from "./FinanceModule";
import { MeetingsManager } from "./MeetingsManager";
import { ValiantAILauncher } from "@/components/ai/ValiantAILauncher";
import type { AdminRole } from "@/data/admin-roles";

const SECTION_META: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Movement at a glance" },
  members: { title: "Members", subtitle: "The full member database" },
  community: { title: "Community", subtitle: "Feed, communities & moderation" },
  meetings: { title: "Meetings", subtitle: "Schedule & attendance" },
  gatherings: { title: "Gatherings", subtitle: "Events, RSVPs & check-in" },
  fundraising: { title: "Fundraising", subtitle: "Campaigns & donations" },
  associations: { title: "Associations", subtitle: "Chapters across the federation" },
  finance: { title: "Finance", subtitle: "Treasury, income & statements" },
  settings: { title: "Settings", subtitle: "Account & preferences" },
};

/** First detail-panel item for each section (the default sub-view). */
const DEFAULT_VIEW: Record<string, string> = {
  dashboard: "At a glance",
  members: "All members",
  community: "Overview",
  meetings: "Upcoming",
  gatherings: "Calendar",
  fundraising: "Active campaigns",
  associations: "National HQ",
  finance: "Overview",
  settings: "Profile",
};

/** Dashboard quick-links that jump to a whole section. */
const DASHBOARD_JUMP: Record<string, string> = {
  Finance: "finance",
  Membership: "members",
  Meetings: "meetings",
  Gatherings: "gatherings",
};

export function AdminShell({ role }: { role: AdminRole }) {
  const [section, setSection] = useState("dashboard");
  const [view, setView] = useState<string>(DEFAULT_VIEW.dashboard);
  const [mobileNav, setMobileNav] = useState(false);
  const meta = SECTION_META[section] ?? SECTION_META.dashboard;

  function changeSection(s: string) {
    setSection(s);
    setView(DEFAULT_VIEW[s] ?? "");
    setMobileNav(false);
  }

  function selectItem(label: string) {
    if (section === "dashboard" && DASHBOARD_JUMP[label]) {
      changeSection(DASHBOARD_JUMP[label]);
      return;
    }
    setView(label);
    setMobileNav(false);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      {/* ============================ Top bar ============================ */}
      <header className="flex h-16 shrink-0 items-stretch border-b border-[var(--color-line)] bg-white">
        {/* Brand zone — aligns over the sidebar (rail 64 + panel 288 = 352) */}
        <div className="hidden w-[352px] shrink-0 items-center border-r border-[var(--color-line)] lg:flex">
          <div className="grid w-16 place-items-center">
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-white p-1 shadow-sm ring-1 ring-black/10">
              <img src="/valiant-logo.png" alt="Valiant Movement" className="h-full w-auto object-contain" />
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="leading-tight">
              <div className="text-[15px] font-bold text-[var(--color-navy)]">Valiant Movement</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-brand-strong)]">
                {role.title}
              </div>
            </div>
          </div>
        </div>

        {/* Section title + actions */}
        <div className="flex flex-1 items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileNav((v) => !v)}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--color-line)] text-[var(--color-ink-soft)] lg:hidden"
              aria-label="Toggle navigation"
            >
              {mobileNav ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-[var(--color-navy)] sm:text-xl">
                {meta.title}
              </h1>
              <p className="hidden truncate text-sm text-[var(--color-muted)] sm:block">
                {meta.subtitle}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="relative hidden xl:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-faint)]" />
              <input
                placeholder="Search members, meetings…"
                className="h-9 w-64 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--color-brand)] focus:bg-white focus:ring-4 focus:ring-[var(--color-brand)]/12"
              />
            </div>
            <button className="grid size-9 place-items-center rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] xl:hidden">
              <Search className="h-4 w-4" />
            </button>
            <button className="relative grid size-9 place-items-center rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--color-brand)]" />
            </button>
            <div className="ml-1 hidden items-center gap-2 rounded-xl border border-[var(--color-line)] py-1.5 pl-1.5 pr-3 sm:flex">
              <span className="grid size-7 place-items-center rounded-lg bg-[var(--color-navy)] text-xs font-bold text-white">
                {role.chip}
              </span>
              <div className="leading-tight">
                <div className="text-xs font-semibold text-[var(--color-ink)]">{role.title}</div>
                <div className="text-[10px] text-[var(--color-faint)]">{role.jurisdiction}</div>
              </div>
            </div>
            <form action={logoutAdmin}>
              <button className="flex h-9 items-center gap-2 rounded-lg bg-[var(--color-navy)] px-3 text-sm font-semibold text-white transition hover:opacity-90">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ===================== Sidebar + content ===================== */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — desktop (brand lives in the topbar) */}
        <div className="hidden lg:block">
          <AdminSidebar
            activeSection={section}
            onSectionChange={changeSection}
            onSelect={selectItem}
            activeItem={view}
            roleLabel={role.title}
            showBrand={false}
            showTitle={false}
          />
        </div>

        {/* Sidebar — mobile drawer */}
        {mobileNav && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNav(false)} />
            <div className="absolute left-0 top-0 h-full">
              <AdminSidebar
                activeSection={section}
                onSectionChange={changeSection}
                onSelect={selectItem}
                activeItem={view}
                roleLabel={role.title}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
          {section === "dashboard" ? (
            <DashboardOverview
              role={role}
              onViewMembers={() => changeSection("members")}
              onOpenMeetings={() => changeSection("meetings")}
            />
          ) : section === "members" ? (
            <MembersDatabase scope={role.scope} jurisdiction={role.jurisdiction} />
          ) : section === "community" ? (
            <AdminCommunity view={view} onViewChange={setView} />
          ) : section === "finance" ? (
            <FinanceModule view={view} onViewChange={setView} />
          ) : section === "meetings" ? (
            <MeetingsManager />
          ) : (
            <Placeholder title={meta.title} subtitle={meta.subtitle} />
          )}
        </main>
      </div>

      {/* Valiant AI — voice + text assistant for coordinators */}
      <ValiantAILauncher />
    </div>
  );
}

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="grid h-full min-h-[60vh] place-items-center">
      <div className="max-w-md rounded-2xl border border-dashed border-[var(--color-line)] bg-white p-10 text-center">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-white p-1.5 ring-1 ring-black/5">
          <img src="/valiant-logo.png" alt="Valiant Movement" className="h-full w-auto object-contain" />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-navy)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {subtitle}. This module is coming next — the <strong>Members database</strong> is live now.
        </p>
        <p className="mt-4 text-xs text-[var(--color-faint)]">Tip: use the sidebar to switch sections.</p>
      </div>
    </div>
  );
}
