/**
 * Log Time handler.
 * Allows team members to log time on tickets via Slack.
 * Parses "I spent 2 hours on CHQ-045" and creates manual time entries.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext, LogTimeData } from "../types";
import { createConversation, updateConversation } from "../conversation";
import { replyInThread, addSlackReaction } from "@/lib/slack";
import { getTicketByNumber } from "@/lib/tickets";

interface LogTimeDraft {
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  hours: number;
  minutes: number;
  note: string | null;
}

export class LogTimeHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { conversation } = ctx;

    if (conversation) {
      await this.handleApproval(ctx);
    } else {
      await this.handleNew(ctx);
    }
  }

  private async handleNew(ctx: HandlerContext): Promise<void> {
    const { channelId, messageTs, user, classification } = ctx;
    const data = classification?.data as LogTimeData | undefined;

    if (!data?.ticketNumber) {
      await replyInThread(channelId, messageTs, "I need a ticket number to log time against. Try: \"I spent 2 hours on CHQ-045\"");
      return;
    }

    const ticket = await getTicketByNumber(data.ticketNumber);
    if (!ticket) {
      await replyInThread(channelId, messageTs, `I couldn't find ticket *${data.ticketNumber}*. Double-check the number?`);
      return;
    }

    const totalMinutes = (data.hours || 0) * 60 + (data.minutes || 0);
    if (totalMinutes <= 0) {
      await replyInThread(channelId, messageTs, "How much time did you spend? Try: \"2 hours\" or \"90 minutes\"");
      return;
    }

    const draft: LogTimeDraft = {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketTitle: ticket.title,
      hours: data.hours || 0,
      minutes: data.minutes || 0,
      note: data.note || null,
    };

    await createConversation({
      threadTs: messageTs,
      channelId,
      intent: "log_time",
      state: "awaiting_approval",
      data: { draft } as unknown as Record<string, unknown>,
      userId: user.id,
    });

    const durationStr = this.formatDuration(draft.hours, draft.minutes);
    const noteStr = draft.note ? `\nNote: ${draft.note}` : "";
    await replyInThread(
      channelId,
      messageTs,
      `Log *${durationStr}* on *${draft.ticketNumber}* (${draft.ticketTitle})?${noteStr}\n\nReply *approve* to confirm.`
    );
  }

  private async handleApproval(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, conversation, user } = ctx;
    if (!conversation) return;

    const text = messageText.toLowerCase().trim();
    if (!["approve", "approved", "yes", "looks good", "lgtm", "do it", "go ahead", "log it"].includes(text)) {
      await replyInThread(channelId, conversation.threadTs, "Reply *approve* to confirm the time entry.");
      return;
    }

    const { draft } = conversation.data as { draft: LogTimeDraft };

    await updateConversation(conversation.threadTs, { state: "logging" });

    try {
      const convex = getConvexClient();
      const totalSeconds = (draft.hours * 60 + draft.minutes) * 60;
      const now = new Date();
      const startTime = new Date(now.getTime() - totalSeconds * 1000).toISOString();

      await convex.mutation(api.timeEntries.create, {
        ticketId: draft.ticketId as any,
        teamMemberId: user.id as any,
        startTime,
        endTime: now.toISOString(),
        note: draft.note || undefined,
      });

      await updateConversation(conversation.threadTs, { state: "done" });
      const durationStr = this.formatDuration(draft.hours, draft.minutes);
      await replyInThread(channelId, conversation.threadTs, `Logged *${durationStr}* on *${draft.ticketNumber}*`);
      await addSlackReaction(channelId, conversation.threadTs, "white_check_mark");
    } catch (err) {
      console.error("Failed to log time:", err);
      await replyInThread(channelId, conversation.threadTs, "Something went wrong logging that time. Please try again.");
    }
  }

  private formatDuration(hours: number, minutes: number): string {
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(" ") || "0m";
  }
}
