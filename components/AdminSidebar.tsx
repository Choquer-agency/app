"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useKeyboardShortcuts } from "./KeyboardShortcutProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { hasPermission, hasMinRole, type RoleLevel, type Permission } from "@/lib/permissions";
import { useClockStatus } from "@/hooks/useClockStatus";

type Child = {
  label: string;
  href: string;
  minRole?: RoleLevel;
  children?: Child[];
  icon?: React.ReactNode;
};
type NavItem = {
  label: string;
  href: string;
  exact?: boolean;
  permission: Permission;
  icon?: React.ReactNode;
  children?: Child[];
  dynamicChildren?: "ticketsProjects";
};

// ---- Icons ----
const iconClass = "w-4 h-4 shrink-0";
const Icons = {
  home: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="m3 9.5 9-7 9 7V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V9.5z" />
    </svg>
  ),
  ticket: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 9a3 3 0 0 1 3 3 3 3 0 0 1-3 3v3h18v-3a3 3 0 0 1-3-3 3 3 0 0 1 3-3V6H3v3z" />
      <path d="M13 6v12" strokeDasharray="2 2" />
    </svg>
  ),
  reports: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 4 4 5-6" />
    </svg>
  ),
  timesheet: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  meeting: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </svg>
  ),
  crm: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="9" cy="8" r="4" />
      <path d="M17 11a3 3 0 1 0 0-6M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M17 14h1a4 4 0 0 1 4 4v1" />
    </svg>
  ),
  payments: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 11h20" />
    </svg>
  ),
  settings: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  back: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  logout: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  ),
  box: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  ),
  users: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  template: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  ),
  calendar: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  bell: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  archive: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
    </svg>
  ),
  activity: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  megaphone: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  eye: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  monitor: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  plug: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M9 2v6M15 2v6M4 10h16v4a8 8 0 0 1-16 0v-4zM12 22v-4" />
    </svg>
  ),
  key: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M21 2l-9.6 9.6a5.5 5.5 0 1 1-3 3L2 22M15 5l4 4" />
    </svg>
  ),
  share: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  ),
  sync: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  clipboard: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  ),
  list: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  search: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  target: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  refresh: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
    </svg>
  ),
  userPlus: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </svg>
  ),
  trending: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="m23 6-9.5 9.5-5-5L1 18" />
      <path d="M17 6h6v6" />
    </svg>
  ),
  folder: (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

const SETTINGS_CHILDREN: Child[] = [
  { label: "Packages", href: "/admin/settings/packages", minRole: "c_suite", icon: Icons.box },
  { label: "Team", href: "/admin/settings/team", icon: Icons.users },
  { label: "Templates", href: "/admin/settings/templates", minRole: "c_suite", icon: Icons.template },
  { label: "Calendar", href: "/admin/settings/calendar", icon: Icons.calendar },
  { label: "Timesheet", href: "/admin/settings/timesheet", icon: Icons.timesheet },
  { label: "Notifications", href: "/admin/settings/notifications", icon: Icons.bell },
  { label: "Past Clients", href: "/admin/settings/past-clients", minRole: "c_suite", icon: Icons.archive },
  { label: "Activity", href: "/admin/settings/activity", minRole: "c_suite", icon: Icons.activity },
  { label: "Meta Ads", href: "/admin/settings/meta-ads", minRole: "c_suite", icon: Icons.megaphone },
  { label: "Visitor ID", href: "/admin/settings/visitor-tracking", minRole: "c_suite", icon: Icons.eye },
  { label: "Desktop App", href: "/admin/settings/desktop", icon: Icons.monitor },
  {
    label: "MCP",
    href: "/admin/settings/mcp",
    icon: Icons.plug,
    children: [
      { label: "MCP Access", href: "/admin/settings/mcp", icon: Icons.key },
      { label: "Connections", href: "/admin/settings/connections", icon: Icons.plug },
      { label: "Destinations", href: "/admin/settings/destinations", icon: Icons.share },
      { label: "Syncs", href: "/admin/settings/syncs", icon: Icons.sync },
    ],
  },
];

function ClockButton({ clockStatus }: { clockStatus: string }) {
  const [loading, setLoading] = useState(false);

  const doAction = async (action: "clockIn" | "break" | "endBreak" | "clockOut") => {
    setLoading(true);
    try {
      const url =
        action === "clockIn"
          ? "/api/admin/timesheet/clock-in"
          : action === "break"
            ? "/api/admin/timesheet/break/start"
            : action === "endBreak"
              ? "/api/admin/timesheet/break/end"
              : "/api/admin/timesheet/clock-out";
      await fetch(url, { method: "POST" });
    } catch {} finally {
      setLoading(false);
    }
  };

  if (clockStatus === "working") {
    return (
      <div className="flex gap-1">
        <button
          onClick={() => doAction("break")}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium text-[var(--foreground)] hover:bg-[#F7F5ED] border border-[var(--border)] disabled:opacity-50 transition"
        >
          Break
        </button>
        <button
          onClick={() => doAction("clockOut")}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium text-white bg-rose-500 hover:opacity-90 disabled:opacity-50 transition"
        >
          Clock Out
        </button>
      </div>
    );
  }

  if (clockStatus === "break") {
    return (
      <button
        onClick={() => doAction("endBreak")}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-amber-500 hover:opacity-90 disabled:opacity-50 transition"
      >
        <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
        End Break
      </button>
    );
  }

  // idle / done
  return (
    <button
      onClick={() => doAction("clockIn")}
      disabled={loading}
      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:opacity-90 disabled:opacity-50 transition"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      Clock In
    </button>
  );
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Work",
    items: [
      { label: "Home", href: "/admin", exact: true, permission: "nav:home", icon: Icons.home },
      {
        label: "Tickets",
        href: "/admin/tickets",
        permission: "nav:tickets",
        icon: Icons.ticket,
        children: [
          { label: "My Board", href: "/admin/tickets/my-board", icon: Icons.clipboard },
          { label: "Task Management", href: "/admin/tickets", icon: Icons.list },
          { label: "SEO", href: "/admin/tickets/seo", icon: Icons.search },
          { label: "Google Ads", href: "/admin/tickets/google-ads", icon: Icons.target },
          { label: "Retainer", href: "/admin/tickets/retainer", icon: Icons.refresh },
        ],
        dynamicChildren: "ticketsProjects",
      },
      { label: "Reports", href: "/admin/reports", permission: "nav:reports", icon: Icons.reports },
      { label: "Timesheet", href: "/admin/timesheet", permission: "nav:timesheet", icon: Icons.timesheet },
      { label: "Meeting Notes", href: "/admin/meeting-notes", permission: "nav:reports", icon: Icons.meeting },
    ],
  },
  {
    title: "Clients",
    items: [
      {
        label: "CRM",
        href: "/admin/crm",
        permission: "nav:clients",
        icon: Icons.crm,
        children: [
          { label: "Clients", href: "/admin/crm", icon: Icons.users },
          { label: "Leads", href: "/admin/crm/leads", minRole: "c_suite", icon: Icons.userPlus },
          { label: "Traffic", href: "/admin/crm/traffic", minRole: "c_suite", icon: Icons.trending },
        ],
      },
      { label: "Payments", href: "/admin/payments", permission: "nav:payments", icon: Icons.payments },
    ],
  },
];

export default function AdminSidebar({
  userName,
  roleLevel,
  profilePicUrl,
  bypassClockIn,
  teamMemberId,
}: {
  userName?: string;
  roleLevel?: RoleLevel;
  profilePicUrl?: string;
  bypassClockIn?: boolean;
  teamMemberId?: string;
}) {
  const pathname = usePathname();
  const { openCommandPalette } = useKeyboardShortcuts();
  const { user } = useCurrentUser();
  const userTags = user?.tags ?? [];
  const isAdmin = roleLevel ? hasMinRole(roleLevel, "c_suite") : false;

  const isSettings = pathname.startsWith("/admin/settings");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Tickets: pathname.startsWith("/admin/tickets"),
    CRM: pathname.startsWith("/admin/crm"),
  });
  const [settingsGroupOpen, setSettingsGroupOpen] = useState<Record<string, boolean>>({});

  const isClockUser = roleLevel
    ? !hasMinRole(roleLevel, "bookkeeper") && !bypassClockIn
    : false;
  const { clockStatus } = useClockStatus(teamMemberId ?? "");

  const projectDocs = useQuery(
    api.projects.listByMember,
    teamMemberId ? { teamMemberId: teamMemberId as Id<"teamMembers"> } : "skip"
  );
  const activeProjects = useMemo(
    () =>
      (projectDocs ?? [])
        .filter((p: any) => p.status === "active" || p.status === "on_hold")
        .map((p: any) => ({
          label: p.clientName || p.name,
          href: `/admin/tickets/projects/${p._id}`,
          icon: Icons.folder,
        })),
    [projectDocs]
  );

  const canOpenCommandPalette = !roleLevel || roleLevel !== "bookkeeper";
  const canSeeSettings = !roleLevel || hasPermission(roleLevel, "nav:settings");

  const visibleSettingsChildren = SETTINGS_CHILDREN.filter((c) => {
    // Meta Ads: admins OR members tagged "Meta Ads" in their team profile
    if (c.href === "/admin/settings/meta-ads") {
      if (isAdmin) return true;
      return userTags.includes("Meta Ads");
    }
    if (!c.minRole) return true;
    if (!roleLevel) return false;
    return hasMinRole(roleLevel, c.minRole);
  });

  const toggleExpand = (label: string) =>
    setExpanded((s) => ({ ...s, [label]: !s[label] }));

  const isExact = (href: string) => pathname === href;
  const isUnder = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const parentClass = (active: boolean) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition ${
      active
        ? "text-[var(--accent)] font-semibold"
        : "text-[var(--foreground)] hover:bg-[#F7F5ED]"
    }`;

  const childClass = (active: boolean) =>
    `flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-md text-sm transition ${
      active
        ? "text-[var(--accent)] font-semibold"
        : "text-[var(--foreground)] hover:bg-[#F7F5ED]"
    }`;

  function renderNavItem(item: NavItem) {
    if (!roleLevel || !hasPermission(roleLevel, item.permission)) return null;
    if (
      item.href === "/admin/timesheet" &&
      roleLevel &&
      !hasMinRole(roleLevel, "bookkeeper")
    )
      return null;

    if (!item.children) {
      const active = isUnder(item.href) && (!item.exact || isExact(item.href));
      return (
        <li key={item.href}>
          <a
            href={item.href}
            className={parentClass(active)}
            style={active ? { backgroundColor: "#FFEFDE" } : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </a>
        </li>
      );
    }

    // Item with children
    const visibleChildren = item.children.filter((c) => {
      if (c.minRole && roleLevel && !hasMinRole(roleLevel, c.minRole)) return false;
      if (item.label === "Tickets") {
        if (c.label === "SEO" && !(isAdmin || userTags.includes("SEO"))) return false;
        if (c.label === "Google Ads" && !(isAdmin || userTags.includes("Google Ads")))
          return false;
      }
      return true;
    });
    const dynamic = item.dynamicChildren === "ticketsProjects" ? activeProjects : [];
    const allChildren = [...visibleChildren, ...dynamic];

    // Deepest match wins; on tie (e.g. child href equals parent href), child takes priority.
    const candidates: { href: string; isParent: boolean; idx: number }[] = [
      { href: item.href, isParent: true, idx: -1 },
      ...allChildren.map((c, idx) => ({ href: c.href, isParent: false, idx })),
    ];
    const matching = candidates.filter((c) => isUnder(c.href));
    const deepest = matching.sort((a, b) => {
      if (b.href.length !== a.href.length) return b.href.length - a.href.length;
      // Same href length → prefer exact match, then prefer child over parent
      const aExact = pathname === a.href ? 1 : 0;
      const bExact = pathname === b.href ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return (a.isParent ? 1 : 0) - (b.isParent ? 1 : 0);
    })[0];
    const parentActive = !!deepest && deepest.isParent;
    const activeChildIdx = deepest && !deepest.isParent ? deepest.idx : -1;
    const groupActive = matching.length > 0;
    const isOpen = expanded[item.label] ?? groupActive;

    return (
      <li key={item.href}>
        <button
          type="button"
          onClick={() => toggleExpand(item.label)}
          className={parentClass(parentActive)}
          style={parentActive ? { backgroundColor: "#FFEFDE" } : undefined}
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={`transition text-[var(--muted)] ${isOpen ? "rotate-90" : ""}`}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        {isOpen && allChildren.length > 0 && (
          <ul className="mt-0.5 mb-1 space-y-0.5">
            {allChildren.map((c, idx) => {
              const active = idx === activeChildIdx;
              return (
                <li key={c.href}>
                  <a
                    href={c.href}
                    className={childClass(active)}
                    style={active ? { backgroundColor: "#FFEFDE" } : undefined}
                  >
                    {c.icon}
                    <span className="truncate">{c.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  }

  return (
    <aside
      className="flex flex-col shrink-0 h-full w-[190px] border-r border-[var(--border)]"
      style={{ background: "#FAF9F5" }}
    >
      {/* Minimal top space for macOS title bar */}
      <div style={{ height: 22 }} />

      {/* Logo */}
      <div className="px-3 pt-1 pb-6">
        <a href="/admin">
          <Image
            src="/choquer-logo.svg"
            alt="Choquer Agency"
            width={165}
            height={15}
            priority
          />
        </a>
      </div>

      {/* Quick Action — matches "+ New" button on tickets */}
      {canOpenCommandPalette && (
        <div className="px-3 pb-5">
          <button
            onClick={openCommandPalette}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            <span className="flex-1 text-left whitespace-nowrap">Quick Action</span>
            <kbd className="shrink-0 px-1.5 py-0.5 text-[10px] bg-white/20 rounded">⌘K</kbd>
          </button>
        </div>
      )}

      {/* Main body — either main nav OR settings list */}
      {isSettings ? (
        <>
          <nav className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="px-2 pb-3">
              <a
                href="/admin"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[var(--foreground)] hover:bg-[#F7F5ED] transition"
              >
                {Icons.back}
                <span>Back</span>
              </a>
            </div>
            <div
              className="px-2.5 mb-1 text-[9.6px] font-medium uppercase tracking-wider text-[var(--muted)]"
              style={{ fontFamily: "var(--font-ibm-plex), sans-serif" }}
            >
              Settings
            </div>
            <ul className="space-y-0.5">
              {visibleSettingsChildren.map((c) => {
                const childHrefs = (c.children ?? []).map((cc) => cc.href);
                const selfActive = pathname === c.href || (!c.children && pathname.startsWith(c.href + "/"));
                const anyChildActive = childHrefs.some(
                  (h) => pathname === h || pathname.startsWith(h + "/")
                );
                const groupActive = selfActive || anyChildActive;
                const isOpen = settingsGroupOpen[c.label] ?? groupActive;

                if (c.children) {
                  return (
                    <li key={c.label}>
                      <button
                        type="button"
                        onClick={() =>
                          setSettingsGroupOpen((s) => ({ ...s, [c.label]: !isOpen }))
                        }
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition ${
                          groupActive && !anyChildActive
                            ? "text-[var(--accent)] font-semibold"
                            : "text-[var(--foreground)] hover:bg-[#F7F5ED]"
                        }`}
                        style={
                          groupActive && !anyChildActive ? { backgroundColor: "#FFEFDE" } : undefined
                        }
                      >
                        {c.icon}
                        <span className="flex-1 text-left">{c.label}</span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className={`transition text-[var(--muted)] ${isOpen ? "rotate-90" : ""}`}
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                      {isOpen && (
                        <ul className="mt-0.5 mb-1 space-y-0.5">
                          {c.children.map((cc) => {
                            const active = pathname === cc.href || pathname.startsWith(cc.href + "/");
                            return (
                              <li key={cc.href}>
                                <a
                                  href={cc.href}
                                  className={`flex items-center gap-2 pl-5 pr-2 py-1.5 rounded-md text-sm transition ${
                                    active
                                      ? "text-[var(--accent)] font-semibold"
                                      : "text-[var(--foreground)] hover:bg-[#F7F5ED]"
                                  }`}
                                  style={active ? { backgroundColor: "#FFEFDE" } : undefined}
                                >
                                  {cc.icon}
                                  <span>{cc.label}</span>
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }

                const active = selfActive;
                return (
                  <li key={c.href}>
                    <a
                      href={c.href}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition ${
                        active
                          ? "text-[var(--accent)] font-semibold"
                          : "text-[var(--foreground)] hover:bg-[#F7F5ED]"
                      }`}
                      style={active ? { backgroundColor: "#FFEFDE" } : undefined}
                    >
                      {c.icon}
                      <span>{c.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
          {/* Logout pinned at bottom of settings nav, above user card */}
          <div className="px-2 pb-2">
            <form action="/api/admin/logout" method="POST">
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[#F7F5ED] transition"
              >
                {Icons.logout}
                <span>Logout</span>
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-3">
            {NAV_GROUPS.map((group) => {
              const rendered = group.items.map(renderNavItem).filter(Boolean);
              if (rendered.length === 0) return null;
              return (
                <div key={group.title}>
                  <div
                    className="px-2.5 mb-1 text-[9.6px] font-medium uppercase tracking-wider text-[var(--muted)]"
                    style={{ fontFamily: "var(--font-ibm-plex), sans-serif" }}
                  >
                    {group.title}
                  </div>
                  <ul className="space-y-0.5">{rendered}</ul>
                </div>
              );
            })}
          </nav>

          {/* Dynamic clock button above Settings */}
          {isClockUser && (
            <div className="px-2 pb-1">
              <ClockButton
                clockStatus={clockStatus}
              />
            </div>
          )}

          {/* Settings pinned above user */}
          {canSeeSettings && (
            <div className="px-2 pb-2">
              <a
                href="/admin/settings"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-[var(--foreground)] hover:bg-[#F7F5ED] transition"
              >
                {Icons.settings}
                <span>Settings</span>
              </a>
            </div>
          )}
        </>
      )}

      {/* User at very bottom — no dropdown */}
      {userName && (
        <div className="border-t border-[var(--border)] p-2">
          <div className="w-full flex items-center gap-2.5 px-2 py-1.5">
            <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
              {profilePicUrl ? (
                <Image
                  src={profilePicUrl}
                  alt={userName}
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[var(--accent)] flex items-center justify-center text-white text-xs font-semibold">
                  {userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
              )}
              {isClockUser && clockStatus === "working" && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#FAF9F5]" />
              )}
              {isClockUser && clockStatus === "break" && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse border-2 border-[#FAF9F5]" />
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-semibold text-[var(--foreground)] truncate">
                {userName}
              </div>
              <div className="text-[10px] text-[var(--muted)] truncate capitalize">
                {isClockUser
                  ? clockStatus === "working"
                    ? "Working"
                    : clockStatus === "break"
                      ? "On break"
                      : "Off the clock"
                  : roleLevel}
              </div>
            </div>
            {process.env.NODE_ENV === "development" && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wider rounded bg-amber-400 text-black shrink-0">
                DEV
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
