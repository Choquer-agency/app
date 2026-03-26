"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import NotificationBell from "./NotificationBell";
import { useKeyboardShortcuts } from "./KeyboardShortcutProvider";
import { hasPermission, hasMinRole, type RoleLevel, type Permission } from "@/lib/permissions";
import { useClockStatusPoll } from "@/hooks/useClockStatusPoll";

const NAV_LINKS: { href: string; label: string; exact?: boolean; permission: Permission }[] = [
  { href: "/admin", label: "Home", exact: true, permission: "nav:home" },
  { href: "/admin/crm", label: "CRM", permission: "nav:clients" },
  { href: "/admin/tickets", label: "Tickets", permission: "nav:tickets" },
  { href: "/admin/reports", label: "Reports", permission: "nav:reports" },
  { href: "/admin/timesheet", label: "Timesheet", permission: "nav:timesheet" },
];

export default function AdminNav({ userName, roleLevel }: { userName?: string; roleLevel?: RoleLevel }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openCommandPalette } = useKeyboardShortcuts();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: number; ticketNumber: string; title: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Clock features only for employees/interns (not admins/bookkeepers)
  const isClockUser = roleLevel ? !hasMinRole(roleLevel, "bookkeeper") : false;
  const { clockStatus, refetch } = useClockStatusPoll();
  const [clockActionLoading, setClockActionLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const handleNavClockAction = useCallback(async (action: "break" | "clockOut") => {
    setClockActionLoading(true);
    try {
      const url = action === "break"
        ? "/api/admin/timesheet/break/start"
        : "/api/admin/timesheet/clock-out";
      const res = await fetch(url, { method: "POST" });
      if (res.ok && action === "break") {
        window.dispatchEvent(new CustomEvent("timerChange"));
      }
      window.dispatchEvent(new CustomEvent("clockStatusChange"));
      refetch();
    } catch {
      // silent
    } finally {
      setClockActionLoading(false);
      setUserMenuOpen(false);
    }
  }, [refetch]);
  const inputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (searchOpen || userMenuOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searchOpen, userMenuOpen]);

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
            {NAV_LINKS.filter((link) => {
              if (!roleLevel || !hasPermission(roleLevel, link.permission)) return false;
              // Hide Timesheet from employee nav — clock is on homepage, history in Settings
              if (link.href === "/admin/timesheet" && roleLevel && !hasMinRole(roleLevel, "bookkeeper")) return false;
              return true;
            }).map((link) => {
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
          {/* Command Palette trigger — hidden from bookkeepers */}
          {(!roleLevel || roleLevel !== "bookkeeper") && <button
            onClick={openCommandPalette}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:border-gray-300 transition"
            title="Search everything"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <span className="text-xs">Search...</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono">&#8984;K</kbd>
          </button>}

          {/* Quick ticket search — hidden from bookkeepers */}
          {(!roleLevel || roleLevel !== "bookkeeper") && <div className="relative" ref={searchRef}>
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
          </div>}

          {/* Meeting Notes shortcut */}
          {(!roleLevel || hasPermission(roleLevel, "nav:reports")) && (
            <a
              href="/admin/meeting-notes"
              className={`p-1.5 rounded-lg transition ${
                pathname.startsWith("/admin/meeting-notes")
                  ? "text-[var(--foreground)] bg-gray-100"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-100"
              }`}
              title="Meeting Notes"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </a>
          )}

          <NotificationBell canDelete={roleLevel ? hasMinRole(roleLevel, "owner") : false} />

          {/* Settings gear + User name dropdown */}
          <div className="flex items-center gap-2">
            {(!roleLevel || hasPermission(roleLevel, "nav:settings")) && (
              <a
                href="/admin/settings"
                className={`p-1.5 rounded-lg transition ${
                  pathname.startsWith("/admin/settings")
                    ? "text-[var(--foreground)] bg-gray-100"
                    : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-100"
                }`}
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </a>
            )}

            {userName && (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition flex items-center gap-1.5"
                >
                  {isClockUser && clockStatus === "working" && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Clocked In" />
                  )}
                  {isClockUser && clockStatus === "break" && (
                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse flex-shrink-0" title="On Break" />
                  )}
                  {userName}
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 bg-white border border-[var(--border)] rounded-xl shadow-lg z-50 min-w-[180px] overflow-hidden">
                    {/* Clock actions — employees only, when clocked in */}
                    {isClockUser && clockStatus === "working" && (
                      <div className="p-2 border-b border-[var(--border)]">
                        <button
                          onClick={() => handleNavClockAction("break")}
                          disabled={clockActionLoading}
                          className="w-full text-left px-3 py-2.5 text-sm font-medium text-[#1A1A1A] bg-[#F6F5F1] hover:bg-[#E5E3DA] rounded-lg transition-colors disabled:opacity-50 mb-1.5"
                        >
                          {clockActionLoading ? "..." : "Start Break"}
                        </button>
                        <button
                          onClick={() => handleNavClockAction("clockOut")}
                          disabled={clockActionLoading}
                          className="w-full text-left px-3 py-2.5 text-sm font-medium text-white bg-rose-900 hover:bg-rose-800 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {clockActionLoading ? "..." : "Clock Out"}
                        </button>
                      </div>
                    )}
                    <div className="py-1">
                      <form action="/api/admin/logout" method="POST">
                        <button
                          type="submit"
                          className="w-full text-left px-4 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-gray-50 transition"
                        >
                          Logout
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
