"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/hooks/useSession";
import { SavedView, TicketFilters } from "@/types";

interface SavedViewsTabsProps {
  activeViewId: string | null;
  onViewSelect: (view: SavedView | null) => void;
  currentFilters: TicketFilters;
  hasUnsavedChanges: boolean;
  onReset?: () => void;
  onChangesSaved?: () => void; // called after successful save to sync parent state
  viewMode?: "list" | "kanban";
  onViewModeChange?: (mode: "list" | "kanban") => void;
}

export default function SavedViewsTabs({
  activeViewId,
  onViewSelect,
  currentFilters,
  hasUnsavedChanges,
  onReset,
  onChangesSaved,
  viewMode,
  onViewModeChange,
}: SavedViewsTabsProps) {
  const session = useSession();
  const teamMemberId = session?.teamMemberId as Id<"teamMembers"> | undefined;

  const rawViews = useQuery(
    api.savedViews.listByMember,
    teamMemberId ? { teamMemberId } : "skip"
  );

  // Map Convex documents to SavedView shape used by the UI
  const views: SavedView[] = useMemo(() => {
    if (!rawViews) return [];
    return rawViews.map((v) => ({
      id: v._id as string,
      teamMemberId: v.teamMemberId as string,
      name: v.name,
      filters: v.filters as TicketFilters,
      isDefault: v.isDefault ?? false,
      sortOrder: v.sortOrder ?? 0,
      createdAt: new Date(v._creationTime).toISOString(),
      updatedAt: new Date(v._creationTime).toISOString(),
    }));
  }, [rawViews]);

  const createView = useMutation(api.savedViews.create);
  const updateView = useMutation(api.savedViews.update);
  const removeView = useMutation(api.savedViews.remove);

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [menuViewId, setMenuViewId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Auto-load default view on mount
  useEffect(() => {
    if (views.length > 0 && activeViewId === null) {
      const defaultView = views.find((v) => v.isDefault);
      if (defaultView) onViewSelect(defaultView);
    }
    // Only run once when views first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views.length]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuViewId(null);
      }
    }
    if (menuViewId !== null) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuViewId]);

  // Focus save input when form opens
  useEffect(() => {
    if (showSaveForm) saveInputRef.current?.focus();
  }, [showSaveForm]);

  async function handleSave() {
    if (!saveName.trim() || !teamMemberId) return;
    try {
      const created = await createView({
        teamMemberId,
        name: saveName.trim(),
        filters: currentFilters,
        isDefault: saveAsDefault,
      });
      if (created) {
        onViewSelect({
          id: created._id as string,
          teamMemberId: created.teamMemberId as string,
          name: created.name,
          filters: created.filters as TicketFilters,
          isDefault: created.isDefault ?? false,
          sortOrder: created.sortOrder ?? 0,
          createdAt: new Date(created._creationTime).toISOString(),
          updatedAt: new Date(created._creationTime).toISOString(),
        });
      }
      setShowSaveForm(false);
      setSaveName("");
      setSaveAsDefault(false);
    } catch {}
  }

  async function handleUpdateFilters(viewId: string) {
    try {
      await updateView({
        id: viewId as Id<"savedViews">,
        filters: currentFilters,
      });
      setMenuViewId(null);
    } catch {}
  }

  async function handleSetDefault(viewId: string) {
    try {
      await updateView({
        id: viewId as Id<"savedViews">,
        isDefault: true,
      });
      setMenuViewId(null);
    } catch {}
  }

  async function handleRename(viewId: string) {
    if (!renameName.trim()) return;
    try {
      await updateView({
        id: viewId as Id<"savedViews">,
        name: renameName.trim(),
      });
      setRenaming(null);
      setRenameName("");
    } catch {}
  }

  async function handleDelete(viewId: string) {
    try {
      await removeView({ id: viewId as Id<"savedViews"> });
      if (activeViewId === viewId) onViewSelect(null);
      setMenuViewId(null);
    } catch {}
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {/* List view tab */}
      <button
        onClick={() => { onViewModeChange?.("list"); onViewSelect(null); }}
        className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
          viewMode === "list" && activeViewId === null
            ? "bg-[var(--accent-light)] text-[var(--accent)] font-medium"
            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-light)]"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
        List
      </button>

      {/* Kanban view tab */}
      <button
        onClick={() => { onViewModeChange?.("kanban"); onViewSelect(null); }}
        className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
          viewMode === "kanban" && activeViewId === null
            ? "bg-[var(--accent-light)] text-[var(--accent)] font-medium"
            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-light)]"
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 4.5h15a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18V6a1.5 1.5 0 011.5-1.5z" />
        </svg>
        Kanban
      </button>

      {/* Saved view tabs */}
      {views.map((view) => (
        <div key={view.id} className="relative flex items-center">
          {renaming === view.id ? (
            <input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onBlur={() => {
                if (renameName.trim()) handleRename(view.id);
                else setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(view.id);
                if (e.key === "Escape") setRenaming(null);
              }}
              autoFocus
              className="px-3 py-1.5 text-sm border border-[var(--accent)] rounded-lg focus:outline-none w-32"
            />
          ) : (
            <button
              onClick={() => { onViewModeChange?.("list"); onViewSelect(view); }}
              className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
                activeViewId === view.id
                  ? "bg-[var(--accent)] text-white font-medium"
                  : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-light)]"
              }`}
            >
              {view.isDefault && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              )}
              {view.name}
              {activeViewId === view.id && hasUnsavedChanges && (
                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
              )}
            </button>
          )}

          {/* Three-dot menu moved to far right — see below */}
        </div>
      ))}

      {/* Unsaved changes: Reset / Save */}
      {activeViewId && hasUnsavedChanges && (
        <div className="flex items-center gap-2 ml-1 border-l border-[var(--border)] pl-3">
          <button
            onClick={onReset}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition whitespace-nowrap"
          >
            Reset
          </button>
          <button
            onClick={async () => {
              if (!activeViewId) return;
              try {
                await updateView({
                  id: activeViewId as Id<"savedViews">,
                  filters: currentFilters,
                });
                onChangesSaved?.();
              } catch {}
            }}
            className="text-xs font-medium text-[var(--accent)] hover:underline transition whitespace-nowrap"
          >
            Save
          </button>
        </div>
      )}

      {/* Save View button/form */}
      {showSaveForm ? (
        <div className="flex items-center gap-2 ml-1">
          <input
            ref={saveInputRef}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setShowSaveForm(false);
                setSaveName("");
              }
            }}
            placeholder="View name..."
            className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)] w-36"
          />
          <label className="flex items-center gap-1 text-xs text-[var(--muted)] whitespace-nowrap">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
              className="rounded"
            />
            Default
          </label>
          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            className="px-2 py-1.5 text-xs font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            Save
          </button>
          <button
            onClick={() => {
              setShowSaveForm(false);
              setSaveName("");
            }}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowSaveForm(true)}
          className="px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-light)] rounded-lg whitespace-nowrap transition"
        >
          + Save View
        </button>
      )}

      {/* Three-dot menu — far right, only when a saved view is active */}
      {activeViewId && (() => {
        const activeView = views.find((v) => v.id === activeViewId);
        if (!activeView) return null;
        return (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (menuViewId === activeView.id) {
                  setMenuViewId(null);
                } else {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
                  setMenuPos({ top: rect.bottom / zoom + 4, left: rect.right / zoom - 180 });
                  setMenuViewId(activeView.id);
                }
              }}
              className="ml-auto p-1 rounded transition text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {menuViewId === activeView.id &&
              typeof document !== "undefined" &&
              ReactDOM.createPortal(
                <div
                  ref={menuRef}
                  className="bg-white border border-[var(--border)] rounded-lg shadow-xl py-0 overflow-hidden min-w-[160px]"
                  style={{
                    position: "fixed",
                    top: menuPos.top,
                    left: menuPos.left,
                    zIndex: 9999,
                  }}
                >
                  <button
                    onClick={() => {
                      setRenaming(activeView.id);
                      setRenameName(activeView.name);
                      setMenuViewId(null);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent-light)] transition"
                  >
                    Rename
                  </button>
                  {!activeView.isDefault && (
                    <button
                      onClick={() => handleSetDefault(activeView.id)}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent-light)] transition"
                    >
                      Set as Default
                    </button>
                  )}
                  <div className="border-t border-[var(--border)]" />
                  <button
                    onClick={() => handleDelete(activeView.id)}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                  >
                    Delete
                  </button>
                </div>,
                document.body
              )}
          </>
        );
      })()}
    </div>
  );
}
