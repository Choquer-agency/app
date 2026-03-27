/**
 * Permission scoping for Slack assistant intents.
 * Maps each intent to the minimum role level required.
 */

import { SlackIntent, SlackUser } from "./types";

// Role level numeric values (matches lib/permissions.ts)
const ROLE_LEVELS: Record<string, number> = {
  owner: 50,
  c_suite: 40,
  bookkeeper: 30,
  employee: 20,
  intern: 10,
};

// Minimum role required for each intent
const INTENT_MIN_ROLE: Record<SlackIntent, number> = {
  // Owner-only commands
  meeting_transcript: 50,
  quick_ticket: 50,
  announcement: 50,
  calendar_event: 50,
  holiday_schedule: 50,
  quote_selection: 50,

  // Team member commands
  modify_ticket: 20,   // employee+ (scoped to own tickets for non-owners)
  status_check: 10,    // everyone
  eod_reply: 10,       // everyone
  my_tickets: 10,      // everyone
  log_time: 10,        // everyone

  // Fallback
  unknown: 10,
};

/**
 * Check if a user has permission to use a given intent.
 */
export function canUseIntent(user: SlackUser, intent: SlackIntent): boolean {
  const userLevel = ROLE_LEVELS[user.roleLevel] ?? 0;
  const requiredLevel = INTENT_MIN_ROLE[intent] ?? 50;
  return userLevel >= requiredLevel;
}

/**
 * Get the list of intents available to a user (for classification prompt filtering).
 */
export function getAvailableIntents(user: SlackUser): SlackIntent[] {
  const userLevel = ROLE_LEVELS[user.roleLevel] ?? 0;
  return (Object.entries(INTENT_MIN_ROLE) as [SlackIntent, number][])
    .filter(([, minLevel]) => userLevel >= minLevel)
    .map(([intent]) => intent);
}
