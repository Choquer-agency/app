"use client";

import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/settings/packages", label: "Packages" },
  { href: "/admin/settings/team", label: "Team" },
  { href: "/admin/settings/templates", label: "Templates" },
  { href: "/admin/settings/calendar", label: "Calendar" },
  { href: "/admin/settings/past-clients", label: "Past Clients" },
  { href: "/admin/settings/activity", label: "Activity" },
];

export default function SettingsSubNav() {
  const pathname = usePathname();

  const tabClass = (href: string) =>
    `whitespace-nowrap px-3 py-2 text-sm transition border-b-2 ${
      pathname.startsWith(href)
        ? "border-[var(--accent)] text-[var(--accent)] font-semibold"
        : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)] hover:border-gray-200"
    }`;

  return (
    <div className="border-b border-[var(--border)] bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <a key={tab.href} href={tab.href} className={tabClass(tab.href)}>
              {tab.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
