"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import NotificationBell from "./NotificationBell";
import { useKeyboardShortcuts } from "./KeyboardShortcutProvider";
import { hasPermission, type RoleLevel, type Permission } from "@/lib/permissions";

const NAV_LINKS: { href: string; label: string; exact?: boolean; permission: Permission }[] = [
  { href: "/admin", label: "Home", exact: true, permission: "nav:home" },
  { href: "/admin/clients", label: "Clients", permission: "nav:clients" },
  { href: "/admin/leads", label: "Leads", permission: "nav:leads" },
  { href: "/admin/tickets", label: "Tickets", permission: "nav:tickets" },
  { href: "/admin/reports", label: "Reports", exact: true, permission: "nav:reports" },
  { href: "/admin/meetings", label: "Meetings", exact: true, permission: "nav:reports" },
  { href: "/admin/timesheet", label: "Timesheet", permission: "nav:timesheet" },
  { href: "/admin/settings", label: "Settings", permission: "nav:settings" },
];

export default function AdminNav({ userName, roleLevel }: { userName?: string; roleLevel?: RoleLevel }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openCommandPalette } = useKeyboardShortcuts();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: number; ticketNumber: string; title: string }>>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    if (searchOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searchOpen]);

  // Focus input when opened
  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/tickets/search?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.slice(0, 5));
        }
      } catch {} finally {
        setSearching(false);
      }
    }, 250);
  }

  function handleSelect(ticketId: number) {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    // Navigate to tickets page with the ticket open
    const url = `/admin/tickets?ticket=${ticketId}`;
    router.push(url);
  }

  return (
    <nav className="bg-white border-b border-[var(--border)] px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="/admin">
            <Image
              src="/choquer-logo.svg"
              alt="Choquer Agency"
              width={144}
              height={34}
              priority
            />
          </a>
          <div className="flex items-center gap-5">
            {NAV_LINKS.filter((link) => !roleLevel || hasPermission(roleLevel, link.permission)).map((link) => {
              const isActive = link.exact
                ? pathname === link.href
                : pathname.startsWith(link.href);
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
        <div className="flex items-center gap-4">
          {/* Command Palette trigger */}
          <button
            onClick={openCommandPalette}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:border-gray-300 transition"
            title="Search everything"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <span className="text-xs">Search...</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono">&#8984;K</kbd>
          </button>

          {/* Quick ticket search */}
          <div className="relative" ref={searchRef}>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className={`sm:hidden p-1.5 rounded-lg transition ${
                searchOpen
                  ? "text-[var(--accent)] bg-[var(--accent-light)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-100"
              }`}
              title="Quick ticket search"
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </button>

            {searchOpen && (
              <div className="absolute right-0 top-full mt-2 w-[320px] bg-white border border-[var(--border)] rounded-xl shadow-xl overflow-hidden z-50">
                <div className="px-3 py-2.5 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                      ref={inputRef}
                      value={searchQuery}
                      onChange={(e) => handleSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setSearchOpen(false);
                          setSearchQuery("");
                        }
                      }}
                      placeholder="Search tickets..."
                      className="flex-1 text-sm bg-transparent outline-none text-[var(--foreground)] placeholder:text-[var(--muted)]"
                    />
                  </div>
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                  {searching ? (
                    <div className="px-4 py-3 text-xs text-[var(--muted)]">Searching...</div>
                  ) : searchQuery && searchResults.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-[var(--muted)]">No tickets found</div>
                  ) : (
                    searchResults.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSelect(t.id)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition flex items-center gap-2.5"
                      >
                        <span className="text-[var(--muted)] font-mono text-xs shrink-0">{t.ticketNumber}</span>
                        <span className="text-[var(--foreground)] truncate">{t.title}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <NotificationBell />

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
