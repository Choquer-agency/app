/**
 * Holiday/schedule change handler.
 * Modifies existing calendar events (move dates, rename, etc.).
 */

import { sql } from "@vercel/postgres";
import { IntentHandler, HandlerContext, HolidayScheduleData } from "../types";
import { createConversation, updateConversation } from "../conversation";
import { replyInThread, addSlackReaction } from "@/lib/slack";

export class HolidayScheduleHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { conversation } = ctx;

    if (conversation) {
      await this.handleApproval(ctx);
    } else {
      await this.handleNew(ctx);
    }
  }

  private async handleNew(ctx: HandlerContext): Promise<void> {
    const { channelId, messageTs, owner, classification } = ctx;
    const data = classification?.data as HolidayScheduleData | undefined;

    // Try to find the calendar event to modify
    let matchingEvents: Array<{ id: number; title: string; event_date: string; event_type: string }> = [];

    if (data?.title) {
      const { rows } = await sql`
        SELECT id, title, event_date::text as event_date, event_type
        FROM calendar_events
        WHERE LOWER(title) LIKE ${`%${data.title.toLowerCase()}%`}
        ORDER BY event_date DESC
        LIMIT 5
      `;
      matchingEvents = rows as typeof matchingEvents;
    }

    if (matchingEvents.length === 0 && data?.originalDate) {
      const { rows } = await sql`
        SELECT id, title, event_date::text as event_date, event_type
        FROM calendar_events
        WHERE event_date = ${data.originalDate}
        LIMIT 5
      `;
      matchingEvents = rows as typeof matchingEvents;
    }

    if (matchingEvents.length === 0) {
      // List upcoming events so user can specify
      const { rows } = await sql`
        SELECT id, title, event_date::text as event_date, event_type
        FROM calendar_events
        WHERE event_date >= CURRENT_DATE
        ORDER BY event_date ASC
        LIMIT 10
      `;
      const eventList = rows.map((e, i) => `${i + 1}. ${e.title} — ${e.event_date}`).join("\n");
      await replyInThread(
        channelId,
        messageTs,
        `I couldn't find that event. Here are the upcoming events:\n\n${eventList}\n\nWhich one did you want to change?`
      );
      return;
    }

    if (matchingEvents.length === 1) {
      const event = matchingEvents[0];
      if (data?.newDate) {
        // We have the event and the new date — confirm
        await createConversation({
          threadTs: messageTs,
          channelId,
          intent: "holiday_schedule",
          state: "awaiting_approval",
          data: { eventId: event.id, eventTitle: event.title, oldDate: event.event_date, newDate: data.newDate },
          ownerId: owner.id,
        });

        await replyInThread(
          channelId,
          messageTs,
          `I'll move *${event.title}* from ${event.event_date} to *${data.newDate}*.\n\nReply *approve* to confirm.`
        );
      } else {
        await replyInThread(channelId, messageTs, `Found *${event.title}* on ${event.event_date}. What date should I move it to?`);
        await createConversation({
          threadTs: messageTs,
          channelId,
          intent: "holiday_schedule",
          state: "awaiting_new_date",
          data: { eventId: event.id, eventTitle: event.title, oldDate: event.event_date },
          ownerId: owner.id,
        });
      }
    } else {
      // Multiple matches — ask which one
      const eventList = matchingEvents.map((e, i) => `${i + 1}. ${e.title} — ${e.event_date}`).join("\n");
      await replyInThread(
        channelId,
        messageTs,
        `I found multiple events:\n\n${eventList}\n\nWhich one? (reply with the number)`
      );
    }
  }

  private async handleApproval(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, conversation } = ctx;
    if (!conversation) return;

    const text = messageText.toLowerCase().trim();
    const data = conversation.data as { eventId: number; eventTitle: string; oldDate: string; newDate?: string };

    if (conversation.state === "awaiting_new_date") {
      // Try to resolve the date
      const resolved = await this.resolveDate(text);
      if (resolved) {
        await updateConversation(conversation.threadTs, {
          state: "awaiting_approval",
          data: { ...data, newDate: resolved },
        });
        await replyInThread(
          channelId,
          conversation.threadTs,
          `I'll move *${data.eventTitle}* from ${data.oldDate} to *${resolved}*.\n\nReply *approve* to confirm.`
        );
      } else {
        await replyInThread(channelId, conversation.threadTs, "I couldn't parse that as a date. Could you try again? (e.g., 'March 28' or '2026-03-28')");
      }
      return;
    }

    if (["approve", "approved", "yes", "looks good", "do it", "go ahead"].includes(text)) {
      if (!data.newDate) {
        await replyInThread(channelId, conversation.threadTs, "I don't have a new date. What date should I move it to?");
        return;
      }

      await sql`UPDATE calendar_events SET event_date = ${data.newDate} WHERE id = ${data.eventId}`;
      await updateConversation(conversation.threadTs, { state: "done" });
      await replyInThread(channelId, conversation.threadTs, `Moved *${data.eventTitle}* to ${data.newDate}`);
      await addSlackReaction(channelId, conversation.threadTs, "white_check_mark");
    } else {
      await replyInThread(channelId, conversation.threadTs, "Reply *approve* to confirm the change.");
    }
  }

  private async resolveDate(dateText: string): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const today = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 50,
          messages: [{
            role: "user",
            content: `Today is ${today}. Convert this to a date: "${dateText}". Return ONLY YYYY-MM-DD, nothing else.`,
          }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const content = data.content?.[0]?.text?.trim();
      if (content && /^\d{4}-\d{2}-\d{2}$/.test(content)) return content;
      return null;
    } catch {
      return null;
    }
  }
}
