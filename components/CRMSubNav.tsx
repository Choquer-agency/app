"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export default function CRMSubNav() {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { roleLevel?: string }) => {
        setUserRole(data.roleLevel || "");
      })
      .catch(() => {});
  }, []);

  const isAdmin = ["owner", "c_suite"].includes(userRole);

  const tabs = [
    { href: "/admin/crm", label: "Clients", exact: true },
    ...(isAdmin ? [{ href: "/admin/crm/leads", label: "Leads" }] : []),
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
    <div className="border-b border-[var(--border)] bg-white">
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
