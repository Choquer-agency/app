"use client";

import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function CRMSubNav() {
  const pathname = usePathname();
  const { roleLevel } = useCurrentUser();
  const userRole = roleLevel || "";

  const isAdmin = ["owner", "c_suite"].includes(userRole);

  const tabs = [
    { href: "/admin/crm", label: "Clients", exact: true },
    ...(isAdmin ? [{ href: "/admin/crm/leads", label: "Leads" }] : []),
    ...(isAdmin ? [{ href: "/admin/crm/traffic", label: "Traffic" }] : []),
  ];

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const tabClass = (href: string, exact?: boolean) =>
    `whitespace-nowrap px-3 py-2 text-sm transition border-b-2 ${
      isActive(href, exact)
        ? "border-[var(--accent)] text-[var(--accent)] font-semibold"
        : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)] hover:border-gray-200"
    }`;

  return (
    <div className="border-b border-[var(--border)] bg-white sticky top-[49px] z-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <a key={tab.href} href={tab.href} className={tabClass(tab.href, tab.exact)}>
              {tab.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
