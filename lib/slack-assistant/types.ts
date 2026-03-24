/**
 * Types for the Slack Assistant intent router.
 */

export type SlackIntent =
  | "meeting_transcript"
  | "quick_ticket"
  | "modify_ticket"
  | "status_check"
  | "announcement"
  | "calendar_event"
  | "holiday_schedule"
  | "quote_selection"
  | "unknown";

export type ExpansionLevel = "none" | "light" | "full";

export interface ClassificationResult {
  intent: SlackIntent;
  confidence: number;
  data: Record<string, unknown>;
  estimatedTicketCount?: 1 | "many";
  expansionLevel?: ExpansionLevel;
  hasLinks?: boolean;
}

// Per-intent data shapes
export interface MeetingTranscriptData {
  transcript: string;
}

export interface QuickTicketData {
  title: string;
  assigneeName: string | null;
  clientName: string | null;
  dueDate: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  description: string | null;
  expansionLevel?: ExpansionLevel;
}

export interface ModifyTicketData {
  ticketNumber: string;
  changes: Array<{
    field: string;
    newValue: string;
  }>;
}

export interface StatusCheckData {
  ticketNumber: string | null;
  teamMemberName: string | null;
  clientName: string | null;
  query: string;
}

export interface AnnouncementData {
  text: string;
}

export interface CalendarEventData {
  title: string;
  date: string | null;
  type: string | null;
}

export interface HolidayScheduleData {
  title: string | null;
  originalDate: string | null;
  newDate: string | null;
}

export interface QuoteSelectionData {
  number: number;
}

// Conversation state stored in slack_conversations table
export interface ConversationState {
  id: number;
  threadTs: string;
  channelId: string;
  intent: SlackIntent;
  state: string;
  data: Record<string, unknown>;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

// Context passed to every handler
export interface HandlerContext {
  messageText: string;
  channelId: string;
  messageTs: string;
  threadTs: string | null;
  files: Array<{ mimetype?: string; url_private?: string; name?: string }>;
  owner: { id: number; slackUserId: string };
  conversation: ConversationState | null;
  classification: ClassificationResult | null;
}

// Handler interface — each intent handler implements this
export interface IntentHandler {
  /** Handle a new message (first message or continuation) */
  handle(ctx: HandlerContext): Promise<void>;
}
