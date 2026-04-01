"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchResults {
  tickets: Array<{ id: number; ticketNumber: string; title: string; status: string; priority: string; clientName?: string }>;
  clients: Array<{ id: number; name: string; clientStatus: string }>;
  projects: Array<{ id: number; name: string; clientName?: string }>;
  members: Array<{ id: number; name: string; role: string }>;
  comments: Array<{ id: number; ticketId: number; content: string; authorName: string; ticketNumber: string; ticketTitle: string }>;
  notes: Array<{ id: number; clientId: number; content: string; author: string; clientName: string }>;
}

interface RecentItem {
  type: "ticket" | "client" | "project" | "member" | "action";
  id: string;
  label: string;
  subtitle?: string;
  url: string;
}

interface ResultItem {
  type: "ticket" | "client" | "project" | "member" | "action";
  id: string;
  label: string;
  subtitle?: string;
  url: string;
}

const QUICK_ACTIONS: ResultItem[] = [
  { type: "action", id: "new-ticket", label: "New Ticket", subtitle: "Create a new ticket", url: "__action:new-ticket" },
  { type: "action", id: "meeting-notes", label: "Meeting Notes", subtitle: "Turn your meeting into tasks", url: "/admin/meeting-notes" },
  { type: "action", id: "timesheet", label: "Timesheet", subtitle: "Manage your time and request vacations", url: "__action:timesheet" },
];

const STORAGE_KEY = "cp_recent_searches";

function getRecentSearches(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(item: RecentItem) {
  try {
    const recent = getRecentSearches().filter((r) =>
      !(r.type === item.type && r.id === item.id) && r.url !== item.url
    );
    recent.unshift(item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {}
}

// Icons per type
function TypeIcon({ type, actionId }: { type: string; actionId?: string }) {
  if (type === "ticket") {
    return (
      <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
      </svg>
    );
  }
  if (type === "client") {
    return (
      <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m16.5-18v18M5.25 6h.008M5.25 9h.008M5.25 12h.008M9 6h.008M9 9h.008M9 12h.008M12.75 6h.008M12.75 9h.008M12.75 12h.008M16.5 6h.008M16.5 9h.008M16.5 12h.008M5.25 15h.008M9 15h.008M12.75 15h.008M16.5 15h.008" />
      </svg>
    );
  }
  if (type === "project") {
    return (
      <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    );
  }
  if (type === "member") {
    return (
      <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    );
  }
  // Action icons — unique per action
  if (actionId === "new-ticket") {
    return (
      <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
    );
  }
  if (actionId === "meeting-notes") {
    return (
      <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      </div>
    );
  }
  if (actionId === "timesheet") {
    return (
      <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
    );
  }
  // fallback action
  return (
    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-[var(--muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
      </svg>
    </div>
  );
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<RecentItem[]>([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Build flat list of items for keyboard nav
  const flatItems: ResultItem[] = [];
  if (query.trim() && results) {
    if (results.tickets.length > 0) {
      for (const t of results.tickets) {
        flatItems.push({
          type: "ticket",
          id: String(t.id),
          label: t.title,
          subtitle: `${t.ticketNumber}${t.clientName ? ` · ${t.clientName}` : ""}`,
          url: `/admin/tickets?ticket=${t.id}`,
        });
      }
    }
    if (results.projects.length > 0) {
      for (const p of results.projects) {
        flatItems.push({
          type: "project",
          id: String(p.id),
          label: p.name,
          subtitle: p.clientName || "",
          url: `/admin/tickets/projects/${p.id}`,
        });
      }
    }
    if (results.clients.length > 0) {
      for (const c of results.clients) {
        flatItems.push({
          type: "client",
          id: String(c.id),
          label: c.name,
          subtitle: c.clientStatus,
          url: `/admin/crm/${c.id}`,
        });
      }
    }
    if (results.members.length > 0) {
      for (const m of results.members) {
        flatItems.push({
          type: "member",
          id: String(m.id),
          label: m.name,
          subtitle: m.role,
          url: "/admin/team",
        });
      }
    }
    if (results.comments && results.comments.length > 0) {
      for (const c of results.comments) {
        // Extract plain text from Tiptap JSON
        let preview = c.content;
        try {
          const json = JSON.parse(c.content);
          const texts: string[] = [];
          function extractText(node: Record<string, unknown>) {
            if (node.text) texts.push(node.text as string);
            if (Array.isArray(node.content)) node.content.forEach((n: Record<string, unknown>) => extractText(n));
          }
          extractText(json);
          preview = texts.join(" ");
        } catch {
          preview = c.content.replace(/[{}":\[\],]/g, " ").replace(/\s+/g, " ").trim();
        }
        preview = preview.slice(0, 80);
        flatItems.push({
          type: "ticket" as const,
          id: `comment-${c.id}`,
          label: preview || "Comment",
          subtitle: `Comment on ${c.ticketNumber} · ${c.ticketTitle}`,
          url: `/admin/tickets?ticket=${c.ticketId}`,
        });
      }
    }
    if (results.notes && results.notes.length > 0) {
      for (const n of results.notes) {
        let preview = n.content;
        try {
          const json = JSON.parse(n.content);
          const texts: string[] = [];
          function extractNoteText(node: Record<string, unknown>) {
            if (node.text) texts.push(node.text as string);
            if (Array.isArray(node.content)) node.content.forEach((nd: Record<string, unknown>) => extractNoteText(nd));
          }
          extractNoteText(json);
          preview = texts.join(" ");
        } catch {
          preview = n.content.replace(/<[^>]+>/g, "").slice(0, 80);
        }
        preview = preview.slice(0, 80);
        flatItems.push({
          type: "client" as const,
          id: `note-${n.id}`,
          label: preview || "Note",
          subtitle: `Note on ${n.clientName} · by ${n.author}`,
          url: `/admin/crm/${n.clientId}`,
        });
      }
    }
  } else {
    // No query, or query but results not yet loaded — keep showing quick actions
    for (const a of QUICK_ACTIONS) {
      flatItems.push(a);
    }
  }

  // Load recent on open
  useEffect(() => {
    if (isOpen) {
      setRecentSearches(getRecentSearches());
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) {
      setResults(null);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          setResults(await res.json());
        }
      } catch {} finally {
        setSearching(false);
      }
    }, 200);
  }, []);

  function handleSelect(item: ResultItem) {
    if (item.url === "__action:new-ticket") {
      onClose();
      window.dispatchEvent(new CustomEvent("command-palette:new-ticket"));
      return;
    }
    if (item.url === "__action:timesheet") {
      onClose();
      // Try /admin/timesheet first — it redirects employees to /admin automatically
      router.push("/admin/timesheet");
      return;
    }
    // Save to recent
    saveRecentSearch({
      type: item.type,
      id: item.id,
      label: item.label,
      subtitle: item.subtitle,
      url: item.url,
    });
    onClose();

    // For tickets/comments, open the detail modal on the current page instead of navigating
    if (item.url.includes("?ticket=")) {
      const ticketId = item.url.split("ticket=")[1];
      if (ticketId) {
        window.dispatchEvent(new CustomEvent("command-palette:open-ticket", { detail: { ticketId: Number(ticketId) } }));
        return;
      }
    }

    router.push(item.url);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(flatItems.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatItems.length) % Math.max(flatItems.length, 1));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(flatItems[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  // Compute section headers for rendering
  const sections: Array<{ title: string; items: Array<ResultItem & { globalIndex: number }> }> = [];
  if (query.trim() && results) {
    let gIdx = 0;
    // Show recent searches above results when typing
    if (recentSearches.length > 0) {
      const recentItems = recentSearches.map((r) => ({ ...r, id: `recent-${r.id}`, globalIndex: gIdx++ }));
      sections.push({ title: "Recent", items: recentItems });
    }
    const ticketItems = flatItems.filter((i) => i.type === "ticket").map((i) => ({ ...i, globalIndex: gIdx++ }));
    const projectItems = flatItems.filter((i) => i.type === "project").map((i) => ({ ...i, globalIndex: gIdx++ }));
    const clientItems = flatItems.filter((i) => i.type === "client").map((i) => ({ ...i, globalIndex: gIdx++ }));
    const memberItems = flatItems.filter((i) => i.type === "member").map((i) => ({ ...i, globalIndex: gIdx++ }));
    if (ticketItems.length > 0) sections.push({ title: "Tickets", items: ticketItems });
    if (projectItems.length > 0) sections.push({ title: "Projects", items: projectItems });
    if (clientItems.length > 0) sections.push({ title: "Clients", items: clientItems });
    if (memberItems.length > 0) sections.push({ title: "Team Members", items: memberItems });
  } else {
    let gIdx = 0;
    const actionItems = flatItems.filter((i) => i.type === "action").map((i) => ({ ...i, globalIndex: gIdx++ }));
    if (actionItems.length > 0) sections.push({ title: "Quick Actions", items: actionItems });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <svg className="w-5 h-5 text-[var(--muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search tickets, clients, projects..."
            className="flex-1 text-sm bg-transparent outline-none text-[var(--foreground)] placeholder:text-[var(--muted)]"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono text-[var(--muted)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto">
          {searching && (
            <div className="px-4 py-8 text-center text-xs text-[var(--muted)]">Searching...</div>
          )}

          {!searching && query.trim() && flatItems.length === 0 && results && (
            <div className="px-4 py-8 text-center text-xs text-[var(--muted)]">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {!searching && sections.map((section) => (
            <div key={section.title}>
              <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] bg-gray-50/80">
                {section.title}
              </div>
              {section.items.map((item) => {
                const isAction = item.type === "action";
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    data-index={item.globalIndex}
                    onClick={() => handleSelect(item)}
                    className={`w-full text-left px-4 flex items-center gap-3 transition text-sm ${
                      isAction ? "py-3" : "py-2.5"
                    } ${
                      selectedIndex === item.globalIndex
                        ? "bg-[var(--accent-light)]"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <TypeIcon type={item.type} actionId={isAction ? item.id : undefined} />
                    <div className="flex-1 min-w-0">
                      <div className={`truncate font-semibold ${
                        isAction && item.id === "new-ticket"
                          ? "text-[var(--accent)]"
                          : "text-[var(--foreground)]"
                      }`}>{item.label}</div>
                      {item.subtitle && (
                        <div className="text-xs text-[var(--muted)] truncate">{item.subtitle}</div>
                      )}
                    </div>
                    {selectedIndex === item.globalIndex && (
                      <kbd className="text-[10px] px-1 py-0.5 rounded bg-white/80 border border-gray-200 font-mono text-[var(--muted)]">
                        ↵
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {!searching && !query.trim() && flatItems.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-[var(--muted)]">
              Start typing to search...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border)] bg-gray-50/50 text-[10px] text-[var(--muted)]">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
