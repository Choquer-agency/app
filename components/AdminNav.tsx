"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";

const NAV_LINKS = [
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/packages", label: "Packages" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/activity", label: "Activity" },
];

export default function AdminNav({ userName }: { userName?: string }) {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-[var(--border)] px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="/admin/clients">
            <Image
              src="/choquer-logo.svg"
              alt="Choquer Agency"
              width={144}
              height={34}
              priority
            />
          </a>
          <div className="flex items-center gap-5">
            {NAV_LINKS.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`text-sm transition ${
                    isActive
                      ? "font-bold text-[var(--foreground)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {userName && (
            <span className="text-sm text-[var(--muted)]">{userName}</span>
          )}
          <form action="/api/admin/logout" method="POST">
            <button
              type="submit"
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Logout
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
