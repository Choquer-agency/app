"use client";

import { usePathname } from "next/navigation";
import { hasMinRole, type RoleLevel } from "@/lib/permissions";

const TABS = [
  { href: "/admin/settings/packages", label: "Packages", minRole: "c_suite" as RoleLevel },
  { href: "/admin/settings/team", label: "Team" },
  { href: "/admin/settings/templates", label: "Templates", minRole: "c_suite" as RoleLevel },
  { href: "/admin/settings/calendar", label: "Calendar" },
  { href: "/admin/settings/timesheet", label: "Timesheet" },
  { href: "/admin/settings/notifications", label: "Notifications" },
  { href: "/admin/settings/past-clients", label: "Past Clients", minRole: "c_suite" as RoleLevel },
  { href: "/admin/settings/activity", label: "Activity", minRole: "c_suite" as RoleLevel },
  { href: "/admin/settings/connections", label: "Connections" },
  { href: "/admin/settings/meta-ads", label: "Meta Ads", minRole: "c_suite" as RoleLevel },
  { href: "/admin/settings/visitor-tracking", label: "Visitor ID", minRole: "c_suite" as RoleLevel },
  { href: "/admin/settings/desktop", label: "Desktop App" },
  { href: "/admin/settings/mcp", label: "MCP Access" },
  { href: "/admin/settings/destinations", label: "Destinations" },
  { href: "/admin/settings/syncs", label: "Syncs" },
];

export default function SettingsSubNav({ roleLevel }: { roleLevel?: RoleLevel | string }) {
  const pathname = usePathname();

  const visibleTabs = TABS.filter((tab) => {
    if (!tab.minRole) return true;
    if (!roleLevel) return false;
    return hasMinRole(roleLevel as RoleLevel, tab.minRole);
  });

  return (
    <nav className="flex flex-col gap-0.5">
      {visibleTabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2 text-sm rounded-md transition ${
              active
                ? "text-[var(--accent)] font-semibold"
                : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5"
            }`}
            style={active ? { backgroundColor: "#FFEFDE" } : undefined}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
