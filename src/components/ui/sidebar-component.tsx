"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useState } from "react";
import {
  Search as SearchIcon,
  Dashboard,
  Calendar as CalendarIcon,
  UserMultiple,
  Analytics,
  Settings as SettingsIcon,
  User as UserIcon,
  ChevronDown as ChevronDownIcon,
  Folder,
  StarFilled,
  Group,
  ChartBar,
  Report,
  View,
  Time,
  CheckmarkOutline,
  Security,
  Notification,
  Money,
  Account,
  Forum,
  Chat,
  Events,
  Flag,
} from "@carbon/icons-react";

/* Adapted from the supplied two-level sidebar for Valiant Movement — Super Admin.
   Dark warm rail + orange brand accents, Valiant logo. */

const softSpringEasing = "cubic-bezier(0.25, 1.1, 0.4, 1)";

/* ------------------------------- Brand ------------------------------- */

function BrandBadge({ roleLabel = "Super Admin" }: { roleLabel?: string }) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 p-1">
        <span className="inline-flex shrink-0 bg-white p-1 shadow ring-1 ring-black/10">
          <img src="/valiant-logo.png" alt="Valiant Movement" className="h-7 w-auto" />
        </span>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-neutral-50">Valiant Movement</div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#f7931e]">
            {roleLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

function RailLogo() {
  return (
    <span className="inline-flex size-9 items-center justify-center rounded-lg bg-white p-1 ring-1 ring-black/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/valiant-logo.png" alt="Valiant Movement" className="h-full w-auto object-contain" />
    </span>
  );
}

function AvatarCircle() {
  return (
    <div className="relative grid size-8 place-items-center rounded-full bg-[#f7931e]/15 ring-1 ring-[#f7931e]/30">
      <UserIcon size={16} className="text-[#f7931e]" />
    </div>
  );
}

/* ---------------------------- Search input --------------------------- */

function SearchContainer({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className={`shrink-0 transition-all duration-500 ${isCollapsed ? "flex w-full justify-center" : "w-full"}`}>
      <div
        className={`flex h-10 items-center rounded-lg bg-black/40 ring-1 ring-neutral-800 transition-all duration-500 ${
          isCollapsed ? "w-10 min-w-10 justify-center" : "w-full"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div className="grid size-10 shrink-0 place-items-center">
          <SearchIcon size={16} className="text-neutral-400" />
        </div>
        <div className={`flex-1 overflow-hidden transition-opacity duration-500 ${isCollapsed ? "w-0 opacity-0" : "opacity-100"}`}>
          <input
            type="text"
            placeholder="Search…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border-none bg-transparent pr-3 text-[14px] text-neutral-50 outline-none placeholder:text-neutral-500"
            tabIndex={isCollapsed ? -1 : 0}
          />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Content map ---------------------------- */

interface MenuItemT {
  icon?: React.ReactNode;
  label: string;
  hasDropdown?: boolean;
  isActive?: boolean;
  children?: MenuItemT[];
}
interface MenuSectionT {
  title: string;
  items: MenuItemT[];
}
interface SidebarContent {
  title: string;
  sections: MenuSectionT[];
}

const i = (Icon: React.ElementType, active = false) => (
  <Icon size={16} className={active ? "text-[#f7931e]" : "text-neutral-300"} />
);

function getAdminContent(active: string): SidebarContent {
  const map: Record<string, SidebarContent> = {
    dashboard: {
      title: "Dashboard",
      sections: [
        {
          title: "Overview",
          items: [
            { icon: i(View, true), label: "At a glance", isActive: true },
            { icon: i(Money), label: "Finance" },
            { icon: i(UserMultiple), label: "Membership" },
            { icon: i(CalendarIcon), label: "Meetings" },
            { icon: i(Group), label: "Gatherings" },
          ],
        },
        {
          title: "Insights",
          items: [
            {
              icon: i(ChartBar),
              label: "Growth",
              hasDropdown: true,
              children: [
                { label: "New members this month" },
                { label: "Verification rate" },
                { label: "Active vs inactive" },
              ],
            },
            {
              icon: i(Report),
              label: "Reports",
              hasDropdown: true,
              children: [{ label: "Weekly summary" }, { label: "State coverage" }],
            },
          ],
        },
      ],
    },
    members: {
      title: "Members",
      sections: [
        {
          title: "Directory",
          items: [
            { icon: i(UserMultiple, true), label: "All members", isActive: true },
            { icon: i(Security), label: "Verification queue" },
            { icon: i(Account), label: "Roles & coordinators" },
          ],
        },
        {
          title: "Segments",
          items: [
            {
              icon: i(Folder),
              label: "By state",
              hasDropdown: true,
              children: [{ label: "Lagos" }, { label: "Kano" }, { label: "Rivers" }, { label: "FCT - Abuja" }],
            },
            { icon: i(Time), label: "Recently joined" },
            { icon: i(CheckmarkOutline), label: "Active" },
          ],
        },
      ],
    },
    community: {
      title: "Community",
      sections: [
        {
          title: "Engagement",
          items: [
            { icon: i(Forum, true), label: "Overview", isActive: true },
            { icon: i(Group), label: "Communities" },
            { icon: i(View), label: "Feed monitor" },
            { icon: i(Chat), label: "Group messaging" },
          ],
        },
        {
          title: "Moderation",
          items: [
            { icon: i(Flag), label: "Flagged content" },
            { icon: i(CheckmarkOutline), label: "Pending approval" },
            {
              icon: i(Events),
              label: "By scope",
              hasDropdown: true,
              children: [
                { label: "State chapters" },
                { label: "LGA & ward groups" },
                { label: "Interest groups" },
              ],
            },
          ],
        },
      ],
    },
    meetings: {
      title: "Meetings",
      sections: [
        {
          title: "Schedule",
          items: [
            { icon: i(CalendarIcon, true), label: "Upcoming", isActive: true },
            { icon: i(Time), label: "Past meetings" },
            { icon: i(CheckmarkOutline), label: "Attendance" },
          ],
        },
      ],
    },
    gatherings: {
      title: "Gatherings",
      sections: [
        {
          title: "Events",
          items: [
            { icon: i(Group, true), label: "Calendar", isActive: true },
            { icon: i(Notification), label: "RSVPs & reminders" },
            { icon: i(CheckmarkOutline), label: "Digital check-in" },
          ],
        },
      ],
    },
    fundraising: {
      title: "Fundraising",
      sections: [
        {
          title: "Campaigns",
          items: [
            { icon: i(StarFilled, true), label: "Active campaigns", isActive: true },
            { icon: i(Money), label: "Donations" },
            { icon: i(ChartBar), label: "Goals & progress" },
          ],
        },
      ],
    },
    associations: {
      title: "Associations",
      sections: [
        {
          title: "Chapters",
          items: [
            { icon: i(Folder, true), label: "National HQ", isActive: true },
            {
              icon: i(Folder),
              label: "State chapters",
              hasDropdown: true,
              children: [{ label: "Lagos" }, { label: "Kano" }, { label: "Rivers" }],
            },
            { icon: i(Folder), label: "LGA & ward units" },
          ],
        },
      ],
    },
    finance: {
      title: "Finance",
      sections: [
        {
          title: "Treasury",
          items: [
            { icon: i(ChartBar, true), label: "Overview", isActive: true },
            { icon: i(Money), label: "Income" },
            { icon: i(Analytics), label: "Expenses" },
            { icon: i(StarFilled), label: "Budgets" },
          ],
        },
        {
          title: "Operations",
          items: [
            { icon: i(Account), label: "Payouts" },
            { icon: i(Report), label: "Statements" },
            {
              icon: i(Folder),
              label: "By chapter",
              hasDropdown: true,
              children: [{ label: "Lagos" }, { label: "Kano" }, { label: "Rivers" }, { label: "FCT - Abuja" }],
            },
          ],
        },
      ],
    },
    settings: {
      title: "Settings",
      sections: [
        {
          title: "Account",
          items: [
            { icon: i(UserIcon, true), label: "Profile", isActive: true },
            { icon: i(Security), label: "Security" },
            { icon: i(Notification), label: "Notifications" },
          ],
        },
      ],
    },
  };
  return map[active] ?? map.dashboard;
}

/* ----------------------------- Icon rail ----------------------------- */

function IconNavButton({
  children,
  isActive = false,
  onClick,
  label,
}: {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`grid size-10 min-w-10 place-items-center rounded-lg transition-colors duration-300 ${
        isActive
          ? "bg-[#f7931e]/15 text-[#f7931e]"
          : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

const RAIL_ITEMS = [
  { id: "dashboard", icon: <Dashboard size={18} />, label: "Dashboard" },
  { id: "members", icon: <UserMultiple size={18} />, label: "Members" },
  { id: "community", icon: <Forum size={18} />, label: "Community" },
  { id: "meetings", icon: <CalendarIcon size={18} />, label: "Meetings" },
  { id: "gatherings", icon: <Group size={18} />, label: "Gatherings" },
  { id: "fundraising", icon: <StarFilled size={18} />, label: "Fundraising" },
  { id: "associations", icon: <Folder size={18} />, label: "Associations" },
  { id: "finance", icon: <Money size={18} />, label: "Finance" },
];

function IconNavigation({
  activeSection,
  onSectionChange,
  showBrand = true,
}: {
  activeSection: string;
  onSectionChange: (s: string) => void;
  showBrand?: boolean;
}) {
  return (
    <aside className="flex h-full w-16 flex-col items-center gap-2 border-r border-neutral-800 bg-[#100d0a] p-3">
      {showBrand && (
        <div className="mb-2 grid size-10 place-items-center">
          <RailLogo />
        </div>
      )}
      <div className="flex w-full flex-col items-center gap-1.5 pt-1">
        {RAIL_ITEMS.map((item) => (
          <IconNavButton
            key={item.id}
            label={item.label}
            isActive={activeSection === item.id}
            onClick={() => onSectionChange(item.id)}
          >
            {item.icon}
          </IconNavButton>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex w-full flex-col items-center gap-2">
        <IconNavButton
          label="Settings"
          isActive={activeSection === "settings"}
          onClick={() => onSectionChange("settings")}
        >
          <SettingsIcon size={18} />
        </IconNavButton>
        <AvatarCircle />
      </div>
    </aside>
  );
}

/* --------------------------- Detail sidebar -------------------------- */

function SectionTitle({
  title,
  onToggleCollapse,
  isCollapsed,
}: {
  title: string;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}) {
  if (isCollapsed) {
    return (
      <div className="flex w-full justify-center">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          className="grid size-10 min-w-10 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
        >
          <span className="inline-block rotate-180">
            <ChevronDownIcon size={16} />
          </span>
        </button>
      </div>
    );
  }
  return (
    <div className="flex w-full items-center justify-between">
      <div className="px-2 text-[18px] font-semibold text-neutral-50">{title}</div>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label="Collapse sidebar"
        className="grid size-10 min-w-10 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
      >
        <ChevronDownIcon size={16} className="-rotate-90" />
      </button>
    </div>
  );
}

function MenuItem({
  item,
  isExpanded,
  onToggle,
  onItemClick,
  isCollapsed,
  activeItem,
}: {
  item: MenuItemT;
  isExpanded?: boolean;
  onToggle?: () => void;
  onItemClick?: () => void;
  isCollapsed?: boolean;
  activeItem?: string;
}) {
  const handleClick = () => {
    if (item.hasDropdown && onToggle) onToggle();
    else onItemClick?.();
  };
  // The selected label (driven by the content area) wins; the static `isActive`
  // in the content map is only the initial highlight before any click.
  const active = activeItem != null ? item.label === activeItem : !!item.isActive;
  return (
    <div className={`shrink-0 ${isCollapsed ? "flex w-full justify-center" : "w-full"}`}>
      <div
        onClick={handleClick}
        title={isCollapsed ? item.label : undefined}
        className={`relative flex cursor-pointer items-center rounded-lg transition-colors duration-300 ${
          active ? "bg-[#f7931e]/15" : "hover:bg-white/5"
        } ${isCollapsed ? "size-10 min-w-10 justify-center" : "h-10 w-full px-3"}`}
      >
        {active && !isCollapsed && (
          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#f7931e]" />
        )}
        <div className="grid size-6 shrink-0 place-items-center">{item.icon}</div>
        <div className={`flex-1 overflow-hidden transition-opacity duration-300 ${isCollapsed ? "w-0 opacity-0" : "ml-2 opacity-100"}`}>
          <div className={`truncate text-[14px] ${active ? "font-medium text-[#f7931e]" : "text-neutral-100"}`}>
            {item.label}
          </div>
        </div>
        {item.hasDropdown && !isCollapsed && (
          <ChevronDownIcon
            size={16}
            className="ml-2 shrink-0 text-neutral-400 transition-transform duration-300"
            style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        )}
      </div>
    </div>
  );
}

function SubMenuItem({
  item,
  onItemClick,
  activeItem,
}: {
  item: MenuItemT;
  onItemClick?: () => void;
  activeItem?: string;
}) {
  const active = activeItem != null && item.label === activeItem;
  return (
    <div className="w-full py-px pl-9 pr-1">
      <div
        onClick={onItemClick}
        className={`flex h-9 cursor-pointer items-center rounded-lg px-3 transition-colors ${
          active ? "bg-[#f7931e]/10" : "hover:bg-white/5"
        }`}
      >
        <div className={`truncate text-[13px] ${active ? "font-medium text-[#f7931e]" : "text-neutral-400"}`}>
          {item.label}
        </div>
      </div>
    </div>
  );
}

function MenuSection({
  section,
  expandedItems,
  onToggleExpanded,
  onSelect,
  isCollapsed,
  activeItem,
}: {
  section: MenuSectionT;
  expandedItems: Set<string>;
  onToggleExpanded: (key: string) => void;
  onSelect?: (label: string) => void;
  isCollapsed?: boolean;
  activeItem?: string;
}) {
  return (
    <div className="flex w-full flex-col">
      <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? "h-0 opacity-0" : "h-9 opacity-100"}`}>
        <div className="flex h-9 items-center px-3 text-[12px] font-medium uppercase tracking-wider text-neutral-500">
          {section.title}
        </div>
      </div>
      {section.items.map((item, index) => {
        const key = `${section.title}-${index}`;
        const isExpanded = expandedItems.has(key);
        return (
          <div key={key} className="flex w-full flex-col">
            <MenuItem
              item={item}
              isExpanded={isExpanded}
              onToggle={() => onToggleExpanded(key)}
              onItemClick={() => onSelect?.(item.label)}
              isCollapsed={isCollapsed}
              activeItem={activeItem}
            />
            {isExpanded && item.children && !isCollapsed && (
              <div className="mb-1 flex flex-col gap-0.5">
                {item.children.map((child, ci) => (
                  <SubMenuItem
                    key={`${key}-${ci}`}
                    item={child}
                    onItemClick={() => onSelect?.(child.label)}
                    activeItem={activeItem}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailSidebar({
  activeSection,
  onSelect,
  showBrand = true,
  showTitle = true,
  activeItem,
  roleLabel,
}: {
  activeSection: string;
  onSelect?: (label: string) => void;
  showBrand?: boolean;
  showTitle?: boolean;
  activeItem?: string;
  roleLabel?: string;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const content = getAdminContent(activeSection);

  const toggleExpanded = (key: string) =>
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <aside
      className={`flex h-full flex-col gap-3 border-r border-neutral-800 bg-[#14110d] p-3 transition-all duration-500 ${
        isCollapsed ? "w-16 min-w-16 items-center" : "w-72"
      }`}
      style={{ transitionTimingFunction: softSpringEasing }}
    >
      {showBrand && !isCollapsed && <BrandBadge roleLabel={roleLabel} />}
      {showTitle && (
        <SectionTitle
          title={content.title}
          onToggleCollapse={() => setIsCollapsed((s) => !s)}
          isCollapsed={isCollapsed}
        />
      )}
      <SearchContainer isCollapsed={isCollapsed} />
      <div className={`flex w-full flex-1 flex-col overflow-y-auto ${isCollapsed ? "items-center gap-1.5" : "gap-3"}`}>
        {content.sections.map((section, idx) => (
          <MenuSection
            key={`${activeSection}-${idx}`}
            section={section}
            expandedItems={expandedItems}
            onToggleExpanded={toggleExpanded}
            onSelect={onSelect}
            isCollapsed={isCollapsed}
            activeItem={activeItem}
          />
        ))}
      </div>
    </aside>
  );
}

/* ------------------------------- Export ------------------------------ */

export function AdminSidebar({
  activeSection,
  onSectionChange,
  onSelect,
  showBrand = true,
  showTitle = true,
  activeItem,
  roleLabel,
}: {
  activeSection: string;
  onSectionChange: (s: string) => void;
  onSelect?: (label: string) => void;
  showBrand?: boolean;
  showTitle?: boolean;
  activeItem?: string;
  roleLabel?: string;
}) {
  return (
    <div className="flex h-full flex-row">
      <IconNavigation
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        showBrand={showBrand}
      />
      <DetailSidebar
        activeSection={activeSection}
        onSelect={onSelect}
        showBrand={showBrand}
        showTitle={showTitle}
        activeItem={activeItem}
        roleLabel={roleLabel}
      />
    </div>
  );
}

export default AdminSidebar;
