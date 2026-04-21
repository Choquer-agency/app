"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSession } from "@/hooks/useSession";
import { hasMinRole, type RoleLevel } from "@/lib/permissions";

interface ToggleItem {
  key: string;
  label: string;
  description: string;
  minRole?: RoleLevel;
}

const PREF_KEYS = [
  "ticket_assigned",
  "ticket_status_stuck",
  "ticket_status_qa_ready",
  "ticket_status_needs_attention",
  "ticket_status_change",
  "ticket_created",
  "ticket_comment",
  "ticket_mention",
  "ticket_due_soon",
  "ticket_overdue",
  "ticket_due_date_changed",
  "ticket_closed",
  "ticket_priority_changed",
  "vacation_requested",
  "vacation_resolved",
  "time_adjustment_requested",
  "time_adjustment_resolved",
  "team_announcement",
  "client_added",
  "hour_cap_warning",
  "hour_cap_exceeded",
  "runaway_timer",
  "package_changed",
  "visitor_high_intent",
] as const;

type PrefKey = (typeof PREF_KEYS)[number];

const TICKET_TOGGLES: ToggleItem[] = [
  { key: "ticket_assigned", label: "Assigned to a ticket", description: "When you are assigned to a ticket" },
  { key: "ticket_status_stuck", label: "Ticket status \u2192 Stuck", description: "When a ticket you're involved with is marked stuck" },
  { key: "ticket_status_qa_ready", label: "Ticket status \u2192 QA Ready", description: "When a ticket moves to QA ready for review" },
  { key: "ticket_status_needs_attention", label: "Ticket \u2192 Needs Attention", description: "When a ticket moves back to needs attention" },
  { key: "ticket_status_change", label: "Any other status change", description: "General status changes not covered above" },
  { key: "ticket_created", label: "New ticket created", description: "When a new ticket is created on your projects" },
  { key: "ticket_comment", label: "Comment on my ticket", description: "When someone comments on a ticket you created or are assigned to" },
  { key: "ticket_mention", label: "Mentioned in a comment", description: "When someone tags you in a comment" },
  { key: "ticket_due_soon", label: "Due date approaching", description: "24 hours before a ticket is due" },
  { key: "ticket_overdue", label: "Ticket overdue", description: "When a ticket passes its due date" },
  { key: "ticket_due_date_changed", label: "Due date changed", description: "When the due date is adjusted on your ticket" },
  { key: "ticket_closed", label: "Ticket closed", description: "When a ticket you're involved with is closed" },
  { key: "ticket_priority_changed", label: "Priority changed", description: "When the priority changes on a ticket you created or are assigned to" },
];

const CLIENT_TOGGLES: ToggleItem[] = [
  { key: "client_added", label: "New client added", description: "Celebrate when a new client is signed to the agency" },
];

const VISITOR_TOGGLES: ToggleItem[] = [
  { key: "visitor_high_intent", label: "High-intent visitor", description: "When an identified company shows high purchase intent on the site", minRole: "c_suite" as RoleLevel },
];

const HR_TOGGLES: ToggleItem[] = [
  { key: "vacation_requested", label: "Vacation day requested", description: "When a team member submits a vacation request", minRole: "bookkeeper" as RoleLevel },
  { key: "vacation_resolved", label: "Vacation request resolved", description: "When your vacation request is approved or denied" },
  { key: "time_adjustment_requested", label: "Time adjustment requested", description: "When a team member requests a time adjustment", minRole: "bookkeeper" as RoleLevel },
  { key: "time_adjustment_resolved", label: "Time adjustment resolved", description: "When your time adjustment is approved or denied" },
  { key: "team_announcement", label: "Team announcement", description: "When a new team announcement is posted" },
];

const OPERATIONAL_TOGGLES: ToggleItem[] = [
  { key: "hour_cap_warning", label: "Hour cap warning (80%)", description: "When a client reaches 80% of their monthly hours", minRole: "bookkeeper" as RoleLevel },
  { key: "hour_cap_exceeded", label: "Hour cap exceeded", description: "When a client exceeds their monthly hours", minRole: "bookkeeper" as RoleLevel },
  { key: "runaway_timer", label: "Runaway timer", description: "When your timer has been running for over 10 hours" },
  { key: "package_changed", label: "Package changed on client", description: "When a package is added, updated, or removed from a client", minRole: "c_suite" as RoleLevel },
];

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  id: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
        checked ? "bg-[var(--accent)]" : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function NotificationPreferences({
  roleLevel,
}: {
  roleLevel?: RoleLevel | string;
}) {
  const session = useSession();
  const teamMemberId = session?.teamMemberId as Id<"teamMembers"> | undefined;

  // Convex real-time query replaces the GET fetch + useEffect
  const serverPrefs = useQuery(
    api.notificationPreferences.getByMember,
    teamMemberId ? { teamMemberId } : "skip"
  );

  // Convex mutation replaces the POST fetch
  const upsertPrefs = useMutation(api.notificationPreferences.upsert);

  // Local optimistic state layered on top of server data
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Debounce timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overridesRef = useRef(optimisticOverrides);
  overridesRef.current = optimisticOverrides;

  // Derive the merged prefs: server data + optimistic overrides
  const prefs = useMemo(() => {
    const base: Record<string, boolean> = {};
    if (serverPrefs) {
      for (const key of PREF_KEYS) {
        const val = serverPrefs[key as keyof typeof serverPrefs];
        if (typeof val === "boolean") {
          base[key] = val;
        }
      }
    }
    return { ...base, ...optimisticOverrides };
  }, [serverPrefs, optimisticOverrides]);

  // Clear optimistic overrides once server catches up
  useEffect(() => {
    if (serverPrefs && Object.keys(optimisticOverrides).length > 0) {
      // Check if all overrides match server — if so, clear them
      let allSynced = true;
      for (const [key, val] of Object.entries(optimisticOverrides)) {
        if (serverPrefs[key as keyof typeof serverPrefs] !== val) {
          allSynced = false;
          break;
        }
      }
      if (allSynced) {
        setOptimisticOverrides({});
      }
    }
  }, [serverPrefs, optimisticOverrides]);

  const persistPrefs = useCallback(async () => {
    if (!teamMemberId) return;
    const current = overridesRef.current;
    if (Object.keys(current).length === 0) return;

    setSaveStatus("saving");
    try {
      // Build the full prefs object to send to upsert
      const prefsToSend: Record<string, boolean> = {};
      for (const key of PREF_KEYS) {
        const overrideVal = current[key];
        if (typeof overrideVal === "boolean") {
          prefsToSend[key] = overrideVal;
        }
      }

      await upsertPrefs({
        teamMemberId,
        prefs: prefsToSend as Record<PrefKey, boolean>,
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      console.error("Failed to save notification preferences");
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [teamMemberId, upsertPrefs]);

  const handleToggle = useCallback(
    (key: string, value: boolean) => {
      // Update optimistic state immediately for responsive UI
      setOptimisticOverrides((prev) => ({ ...prev, [key]: value }));

      // Debounce the save: wait 500ms for more toggles before persisting
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        persistPrefs();
      }, 500);
    },
    [persistPrefs]
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const filterToggles = (items: ToggleItem[]) =>
    items.filter((item) => {
      if (!item.minRole) return true;
      if (!roleLevel) return false;
      return hasMinRole(roleLevel as RoleLevel, item.minRole);
    });

  // Loading: serverPrefs is undefined while the query is in flight
  const loading = serverPrefs === undefined && teamMemberId !== undefined;

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-[var(--border)] rounded-lg p-6 animate-pulse">
            <div className="h-5 bg-gray-100 rounded w-40 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-4 bg-gray-50 rounded w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {saveStatus === "saving" && (
        <div className="fixed top-4 right-4 z-50 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-4 py-2 text-sm font-medium shadow-sm">
          Saving...
        </div>
      )}
      {saveStatus === "saved" && (
        <div className="fixed top-4 right-4 z-50 bg-green-50 text-green-700 border border-green-200 rounded-lg px-4 py-2 text-sm font-medium shadow-sm">
          Preferences saved
        </div>
      )}
      {saveStatus === "error" && (
        <div className="fixed top-4 right-4 z-50 bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm font-medium shadow-sm">
          Failed to save — try again
        </div>
      )}

      <ToggleGroup
        title="Ticket Notifications"
        description="Notifications related to ticket assignments, status changes, comments, and deadlines."
        items={filterToggles(TICKET_TOGGLES)}
        prefs={prefs}
        onToggle={handleToggle}
      />

      <ToggleGroup
        title="Timesheet & HR"
        description="Vacation requests, time adjustments, and team announcements."
        items={filterToggles(HR_TOGGLES)}
        prefs={prefs}
        onToggle={handleToggle}
      />

      <ToggleGroup
        title="Clients"
        description="Celebrations and announcements when new clients are signed."
        items={filterToggles(CLIENT_TOGGLES)}
        prefs={prefs}
        onToggle={handleToggle}
      />

      <ToggleGroup
        title="Operational"
        description="Hour caps, runaway timers, and other operational alerts."
        items={filterToggles(OPERATIONAL_TOGGLES)}
        prefs={prefs}
        onToggle={handleToggle}
      />

      <ToggleGroup
        title="Website Visitors"
        description="Alerts when identified companies visit the site with high purchase intent."
        items={filterToggles(VISITOR_TOGGLES)}
        prefs={prefs}
        onToggle={handleToggle}
      />
    </div>
  );
}

function ToggleGroup({
  title,
  description,
  items,
  prefs,
  onToggle,
}: {
  title: string;
  description: string;
  items: ToggleItem[];
  prefs: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-white border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
        <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {items.map((item) => (
          <label
            key={item.key}
            htmlFor={`toggle-${item.key}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="pr-4">
              <div className="text-sm font-medium text-[var(--foreground)]">
                {item.label}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {item.description}
              </div>
            </div>
            <Toggle
              id={`toggle-${item.key}`}
              checked={prefs[item.key] ?? true}
              onChange={(val) => onToggle(item.key, val)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
