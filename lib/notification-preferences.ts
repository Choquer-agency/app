import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";

// Preference key type
export type PreferenceKey =
  | "ticket_assigned"
  | "ticket_status_stuck"
  | "ticket_status_qa_ready"
  | "ticket_status_needs_attention"
  | "ticket_status_change"
  | "ticket_created"
  | "ticket_comment"
  | "ticket_mention"
  | "ticket_due_soon"
  | "ticket_overdue"
  | "ticket_due_date_changed"
  | "ticket_closed"
  | "vacation_requested"
  | "vacation_resolved"
  | "time_adjustment_requested"
  | "time_adjustment_resolved"
  | "team_announcement"
  | "hour_cap_warning"
  | "hour_cap_exceeded"
  | "runaway_timer";

// Defaults: true = ON, false = OFF
export const PREFERENCE_DEFAULTS: Record<PreferenceKey, boolean> = {
  ticket_assigned: true,
  ticket_status_stuck: true,
  ticket_status_qa_ready: true,
  ticket_status_needs_attention: true,
  ticket_status_change: true,
  ticket_created: false,
  ticket_comment: true,
  ticket_mention: true,
  ticket_due_soon: true,
  ticket_overdue: true,
  ticket_due_date_changed: false,
  ticket_closed: false,
  vacation_requested: true,
  vacation_resolved: true,
  time_adjustment_requested: true,
  time_adjustment_resolved: true,
  team_announcement: true,
  hour_cap_warning: true,
  hour_cap_exceeded: true,
  runaway_timer: true,
};

export interface NotificationMetadata {
  newStatus?: string;
}

// Maps notification type + metadata to a preference key
export function getPreferenceKey(
  type: string,
  metadata?: NotificationMetadata
): PreferenceKey {
  switch (type) {
    case "assigned":
      return "ticket_assigned";
    case "status_change": {
      const status = metadata?.newStatus;
      if (status === "stuck") return "ticket_status_stuck";
      if (status === "qa_ready") return "ticket_status_qa_ready";
      if (status === "needs_attention") return "ticket_status_needs_attention";
      return "ticket_status_change";
    }
    case "comment":
      return "ticket_comment";
    case "mention":
      return "ticket_mention";
    case "due_soon":
      return "ticket_due_soon";
    case "overdue":
      return "ticket_overdue";
    case "ticket_created":
      return "ticket_created";
    case "due_date_changed":
      return "ticket_due_date_changed";
    case "ticket_closed":
      return "ticket_closed";
    case "vacation_requested":
      return "vacation_requested";
    case "vacation_resolved":
      return "vacation_resolved";
    case "time_adjustment_requested":
      return "time_adjustment_requested";
    case "time_adjustment_resolved":
      return "time_adjustment_resolved";
    case "team_announcement":
      return "team_announcement";
    case "hour_cap_warning":
      return "hour_cap_warning";
    case "hour_cap_exceeded":
      return "hour_cap_exceeded";
    case "runaway_timer":
      return "runaway_timer";
    default:
      return "ticket_status_change";
  }
}

// In-memory cache for bulk preference lookups within a single request
const prefsCache = new Map<string, Record<string, boolean | undefined> | null>();

export function clearPrefsCache(): void {
  prefsCache.clear();
}

async function fetchPreferences(
  recipientId: string
): Promise<Record<string, boolean | undefined> | null> {
  if (prefsCache.has(recipientId)) {
    return prefsCache.get(recipientId) ?? null;
  }

  try {
    const convex = getConvexClient();
    const doc = await convex.query(api.notificationPreferences.getByMember, {
      teamMemberId: recipientId as any,
    });
    const result = doc ? (doc as any) : null;
    prefsCache.set(recipientId, result);
    return result;
  } catch (err) {
    console.error("[notification-preferences] Failed to fetch preferences:", err);
    prefsCache.set(recipientId, null);
    return null;
  }
}

// Check if a recipient wants this notification type
export async function shouldNotify(
  recipientId: string,
  type: string,
  metadata?: NotificationMetadata
): Promise<boolean> {
  const prefKey = getPreferenceKey(type, metadata);
  const prefs = await fetchPreferences(recipientId);

  if (!prefs) {
    // No preferences row = use defaults
    return PREFERENCE_DEFAULTS[prefKey] ?? true;
  }

  const value = (prefs as any)[prefKey];
  if (value === undefined || value === null) {
    return PREFERENCE_DEFAULTS[prefKey] ?? true;
  }

  return value;
}
