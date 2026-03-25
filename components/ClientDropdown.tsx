"use client";

import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { ClientConfig } from "@/types";

export default function ClientDropdown({
  clientId,
  clientName,
  onChange,
}: {
  clientId: string | null;
  clientName: string | undefined;
  onChange: (clientId: string | null, clientName: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Fetch clients once on first open
  useEffect(() => {
    if (open && !loaded) {
      fetch("/api/admin/clients")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: ClientConfig[]) => {
          setClients(data.filter((c) => c.active));
          setLoaded(true);
        })
        .catch(() => {});
    }
  }, [open, loaded]);

  // Focus search input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Close on outside click / scroll (but not scroll INSIDE the dropdown)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }
    function handleScroll(e: Event) {
      // Don't close if scrolling inside the dropdown itself
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
      setSearch("");
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("scroll", handleScroll, true);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function toggleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      setPos({ top: rect.bottom / zoom + 4, left: rect.left / zoom });
    }
    setOpen(!open);
    if (open) setSearch("");
  }

  const filtered = clients
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 5);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="text-sm text-[var(--foreground)] hover:text-[var(--accent)] transition cursor-pointer focus:outline-none"
      >
        {clientName || <span className="text-[var(--muted)]">Empty</span>}
      </button>
      {open &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            className="bg-white border border-[var(--border)] rounded-lg shadow-xl overflow-hidden w-[240px]"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
            }}
          >
            {/* Search input */}
            <div className="px-2.5 py-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-md">
                <svg className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clients..."
                  className="flex-1 text-sm bg-transparent outline-none text-[var(--foreground)] placeholder:text-[var(--muted)]"
                />
              </div>
            </div>

            {/* Results */}
            <div className="max-h-[180px] overflow-y-auto">
              {/* Clear option */}
              {clientId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(null, null);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition flex items-center gap-2 text-[var(--muted)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                  Clear client
                </button>
              )}

              {!loaded ? (
                <div className="px-3 py-3 text-xs text-[var(--muted)]">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[var(--muted)]">No clients found</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(c.id, c.name);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent-light)] transition flex items-center gap-2.5 ${
                      c.id === clientId ? "bg-[var(--accent-light)] font-semibold" : ""
                    }`}
                  >
                    <svg className="w-4 h-4 text-[var(--muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                    </svg>
                    <span className="truncate">{c.name}</span>
                    {c.id === clientId && (
                      <svg className="w-4 h-4 text-[var(--accent)] ml-auto shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
