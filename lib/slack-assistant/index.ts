/**
 * Slack Assistant — Main router.
 * Classifies incoming owner messages and dispatches to the appropriate handler.
 */

import { sql } from "@vercel/postgres";
import { classifyIntent } from "./classify";
import { getConversation } from "./conversation";
import { applyVoiceCorrections } from "./voice-corrections";
import { HandlerContext, SlackIntent, IntentHandler } from "./types";
import { addSlackReaction } from "@/lib/slack";

// Handler imports
import { AnnouncementHandler } from "./handlers/announcement";
import { CalendarEventHandler } from "./handlers/calendar-event";
import { QuoteSelectionHandler } from "./handlers/quote-selection";
import { MeetingTranscriptHandler } from "./handlers/meeting-transcript";
import { QuickTicketHandler } from "./handlers/quick-ticket";
import { ModifyTicketHandler } from "./handlers/modify-ticket";
import { StatusCheckHandler } from "./handlers/status-check";
import { HolidayScheduleHandler } from "./handlers/holiday-schedule";

// Handler registry
const handlers: Record<string, IntentHandler> = {
  announcement: new AnnouncementHandler(),
  calendar_event: new CalendarEventHandler(),
  quote_selection: new QuoteSelectionHandler(),
  meeting_transcript: new MeetingTranscriptHandler(),
  quick_ticket: new QuickTicketHandler(),
  modify_ticket: new ModifyTicketHandler(),
  status_check: new StatusCheckHandler(),
  holiday_schedule: new HolidayScheduleHandler(),
};

/**
 * Get team member and client names for intent classification.
 */
async function getContextNames(): Promise<{ teamMemberNames: string[]; clientNames: string[] }> {
  const [teamResult, clientResult] = await Promise.all([
    sql`SELECT name FROM team_members WHERE active = true`,
    sql`SELECT name FROM clients WHERE active = true`,
  ]);
  return {
    teamMemberNames: teamResult.rows.map((r) => r.name as string),
    clientNames: clientResult.rows.map((r) => r.name as string),
  };
}

/**
 * Main entry point — called from the Slack events route via after().
 * Handles both new messages and conversation continuations.
 */
export async function handleOwnerMessage(event: {
  text?: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  files?: Array<{ mimetype?: string; url_private?: string; name?: string }>;
  user: string;
}, owner: { id: number; slackUserId: string }): Promise<void> {
  const messageText = (event.text || "").trim();
  const threadTs = event.thread_ts || null;
  const files = event.files || [];

  // If this is a reply in an existing conversation thread, continue that conversation
  if (threadTs) {
    const conversation = await getConversation(threadTs);
    if (conversation) {
      const handler = handlers[conversation.intent];
      if (handler) {
        const ctx: HandlerContext = {
          messageText: applyVoiceCorrections(messageText),
          channelId: event.channel,
          messageTs: event.ts,
          threadTs,
          files,
          owner,
          conversation,
          classification: null,
        };
        await handler.handle(ctx);
        return;
      }
    }
  }

  // New message — classify intent
  if (!messageText && files.length === 0) return;

  // Add thinking reaction while processing
  await addSlackReaction(event.channel, event.ts, "hourglass_flowing_sand");

  const { teamMemberNames, clientNames } = await getContextNames();
  const classification = await classifyIntent(messageText, teamMemberNames, clientNames);

  // Low confidence → ask for clarification
  if (classification.confidence < 0.4 && classification.intent !== "quote_selection") {
    const { replyInThread } = await import("@/lib/slack");
    await replyInThread(
      event.channel,
      event.ts,
      `I'm not sure what you'd like me to do. Could you clarify? For example:\n• Paste a meeting transcript for me to extract tasks\n• "Add a ticket for [person] to [task] by [date]"\n• "What's the status of CHQ-XXX?"\n• "Announce: [message for the team]"`
    );
    return;
  }

  const handler = handlers[classification.intent];
  if (!handler) {
    // Unknown intent
    const { replyInThread } = await import("@/lib/slack");
    await replyInThread(
      event.channel,
      event.ts,
      `I'm not sure what you'd like me to do. Could you rephrase that?`
    );
    return;
  }

  const ctx: HandlerContext = {
    messageText: applyVoiceCorrections(messageText),
    channelId: event.channel,
    messageTs: event.ts,
    threadTs: null,
    files,
    owner,
    conversation: null,
    classification,
  };

  await handler.handle(ctx);
}
