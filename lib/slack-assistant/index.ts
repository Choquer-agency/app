/**
 * Slack Assistant — Main router.
 * Classifies incoming messages and dispatches to the appropriate handler.
 * Supports both owner and team member messages.
 */

import { getConvexClient } from "../convex-server";
import { api } from "@/convex/_generated/api";
import { classifyIntent } from "./classify";
import { getConversation } from "./conversation";
import { applyVoiceCorrections } from "./voice-corrections";
import { HandlerContext, SlackIntent, SlackUser, IntentHandler } from "./types";
import { addSlackReaction } from "@/lib/slack";
import { canUseIntent } from "./permissions";

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

// Lazy-loaded handlers (new — loaded on first use to avoid circular imports)
async function getHandler(intent: string): Promise<IntentHandler | null> {
  if (handlers[intent]) return handlers[intent];

  // Lazy-load new handlers
  switch (intent) {
    case "eod_reply": {
      const { EodReplyHandler } = await import("./handlers/eod-reply");
      handlers.eod_reply = new EodReplyHandler();
      return handlers.eod_reply;
    }
    case "my_tickets": {
      const { MyTicketsHandler } = await import("./handlers/my-tickets");
      handlers.my_tickets = new MyTicketsHandler();
      return handlers.my_tickets;
    }
    case "log_time": {
      const { LogTimeHandler } = await import("./handlers/log-time");
      handlers.log_time = new LogTimeHandler();
      return handlers.log_time;
    }
    default:
      return null;
  }
}

/**
 * Get team member and client names for intent classification.
 */
async function getContextNames(): Promise<{ teamMemberNames: string[]; clientNames: string[] }> {
  const convex = getConvexClient();
  const [teamMembers, clients] = await Promise.all([
    convex.query(api.teamMembers.list, { activeOnly: true }),
    convex.query(api.clients.list, {}),
  ]);
  return {
    teamMemberNames: teamMembers.map((r: any) => r.name as string),
    clientNames: clients.map((r: any) => r.name as string),
  };
}

/**
 * Check if a thread_ts corresponds to an EOD check-in message.
 * Primary: looks up by slackTs in the database.
 * Fallback: fetches the thread parent from Slack and checks the text pattern.
 */
async function isEodCheckinThread(threadTs: string, channelId: string): Promise<{ teamMemberId: string; data: any } | null> {
  const convex = getConvexClient();

  // Primary: database lookup by slackTs
  try {
    const msg = await convex.query(api.slackMessages.getBySlackTs, { slackTs: threadTs });
    if (msg && msg.messageType === "eod_checkin") {
      console.log("[slack] EOD check-in found via DB lookup, slackTs:", threadTs);
      return { teamMemberId: msg.teamMemberId, data: msg.data };
    }
  } catch (err) {
    console.log("[slack] DB lookup for EOD check-in failed:", err);
  }

  // Fallback: fetch the thread parent from Slack and check the text
  try {
    const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
    if (!token) return null;

    const res = await fetch(`https://slack.com/api/conversations.replies?channel=${channelId}&ts=${threadTs}&limit=1&inclusive=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.ok || !data.messages?.length) return null;

    const parentMsg = data.messages[0];
    // Check if it matches the EOD check-in pattern
    if (parentMsg.text && parentMsg.text.includes("quick EOD check-in")) {
      console.log("[slack] EOD check-in detected via Slack fallback, threadTs:", threadTs);
      // Try to extract ticket info from the message text
      const ticketRegex = /• (CHQ-\d+): (.+)/g;
      const tickets: Array<{ ticketNumber: string; title: string }> = [];
      let match;
      while ((match = ticketRegex.exec(parentMsg.text)) !== null) {
        tickets.push({ ticketNumber: match[1], title: match[2].split(" (you committed")[0].trim() });
      }

      // Resolve ticket IDs
      const allTickets = await convex.query(api.tickets.list, {});
      const resolvedTickets = tickets.map((t) => {
        const ticket = (allTickets as any[]).find((at: any) => at.ticketNumber === t.ticketNumber);
        return {
          ticketId: ticket?._id || "",
          ticketNumber: t.ticketNumber,
          title: t.title,
          clientName: null,
          isCommitmentDue: parentMsg.text.includes(`${t.ticketNumber}`) && parentMsg.text.includes("committed"),
        };
      }).filter((t) => t.ticketId);

      return { teamMemberId: "", data: { tickets: resolvedTickets } };
    }
  } catch (err) {
    console.log("[slack] Slack fallback for EOD check-in failed:", err);
  }

  return null;
}

/**
 * Main entry point — called from the Slack events route.
 * Handles both new messages and conversation continuations.
 * Works for any team member, not just the owner.
 */
export async function handleSlackMessage(event: {
  text?: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  files?: Array<{ mimetype?: string; url_private?: string; name?: string }>;
  user: string;
}, user: SlackUser): Promise<void> {
  const messageText = (event.text || "").trim();
  const threadTs = event.thread_ts || null;
  const files = event.files || [];

  // If this is a reply in an existing conversation thread, continue that conversation
  if (threadTs) {
    const conversation = await getConversation(threadTs);
    if (conversation) {
      const handler = await getHandler(conversation.intent);
      if (handler) {
        const ctx: HandlerContext = {
          messageText: applyVoiceCorrections(messageText),
          channelId: event.channel,
          messageTs: event.ts,
          threadTs,
          files,
          user,
          conversation,
          classification: null,
        };
        await handler.handle(ctx);
        return;
      }
    }

    // Check if this is a reply to an EOD check-in message
    const eodMsg = await isEodCheckinThread(threadTs, event.channel);
    if (eodMsg) {
      const handler = await getHandler("eod_reply");
      if (handler) {
        const ctx: HandlerContext = {
          messageText: applyVoiceCorrections(messageText),
          channelId: event.channel,
          messageTs: event.ts,
          threadTs,
          files,
          user,
          conversation: null,
          classification: {
            intent: "eod_reply",
            confidence: 1.0,
            data: { eodMessageData: eodMsg.data },
          },
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
  const classification = await classifyIntent(messageText, teamMemberNames, clientNames, {
    isOwner: user.isOwner,
    userName: user.name,
  });

  // Permission check
  if (!canUseIntent(user, classification.intent)) {
    const { replyInThread } = await import("@/lib/slack");
    await replyInThread(
      event.channel,
      event.ts,
      "That command is only available to the account owner. You can ask me about your tickets, log time, or reply to your EOD check-in."
    );
    return;
  }

  // Low confidence → ask for clarification
  if (classification.confidence < 0.4 && classification.intent !== "quote_selection") {
    const { replyInThread } = await import("@/lib/slack");
    const helpText = user.isOwner
      ? `I'm not sure what you'd like me to do. Could you clarify? For example:\n• Paste a meeting transcript for me to extract tasks\n• "Add a ticket for [person] to [task] by [date]"\n• "What's the status of CHQ-XXX?"\n• "Announce: [message for the team]"`
      : `I'm not sure what you'd like me to do. Try:\n• "What's on my plate?"\n• "What's the status of CHQ-XXX?"\n• "Log 2 hours on CHQ-XXX"\n• Reply to your EOD check-in with updates`;
    await replyInThread(event.channel, event.ts, helpText);
    return;
  }

  const handler = await getHandler(classification.intent);
  if (!handler) {
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
    user,
    conversation: null,
    classification,
  };

  await handler.handle(ctx);
}

/**
 * @deprecated Use handleSlackMessage instead. Kept for backward compatibility.
 */
export const handleOwnerMessage = handleSlackMessage;
