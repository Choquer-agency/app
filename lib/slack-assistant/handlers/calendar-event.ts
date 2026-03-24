/**
 * Calendar event handler — migrated from the original route.ts.
 * Parses natural language into calendar events using Claude AI.
 */

import { sql } from "@vercel/postgres";
import { IntentHandler, HandlerContext, CalendarEventData } from "../types";
import { addSlackReaction, replyInThread } from "@/lib/slack";

export class CalendarEventHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, messageTs, classification } = ctx;

    // Use data from classification if available, otherwise parse the raw text
    let title: string | null = null;
    let date: string | null = null;
    let type: string | null = null;

    if (classification?.data) {
      const data = classification.data as unknown as CalendarEventData;
      title = data.title || null;
      date = data.date || null;
      type = data.type || null;
    }

    // If classification didn't fully parse it, use Claude to extract details
    if (!title || !date) {
      const parsed = await parseCalendarEvent(messageText);
      if (!parsed) {
        await replyInThread(channelId, messageTs, "I couldn't parse that as a calendar event. Could you try again with a format like: 'Team lunch next Thursday' or 'Add Good Friday as a holiday on April 3'?");
        return;
      }
      title = parsed.title;
      date = parsed.date;
      type = parsed.type;
    }

    await sql`
      INSERT INTO calendar_events (title, event_date, event_type)
      VALUES (${title}, ${date}, ${type || "custom"})
    `;

    await addSlackReaction(channelId, messageTs, "calendar");
  }
}

export async function parseCalendarEvent(raw: string): Promise<{ title: string; date: string; type: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

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
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Extract a calendar event from this text. Today is ${todayStr}.

FORMATTING RULES — apply these strictly for consistency:
- Title format: "Event Name — Category" using an em dash (—)
- For holidays: "Good Friday — Holiday", "Christmas Day — Holiday", "Easter Monday — Holiday"
- For team events: "Team Lunch — Event", "Company BBQ — Event"
- For custom: "Quarterly Review — Meeting", "Tax Deadline — Reminder"
- Fix spelling, capitalize properly, keep it clean and concise
- The title should ALWAYS end with " — Category" where Category is Holiday, Event, Meeting, Reminder, or similar

type should be one of: "holiday", "event", "custom"
- Use "holiday" for public/statutory holidays (Good Friday, Christmas, Thanksgiving, etc.)
- Use "event" for team/company events (lunch, party, offsite, etc.)
- Use "custom" for anything else (deadlines, reminders, etc.)

Return ONLY this JSON (no markdown fences):
{"title": "Good Friday — Holiday", "date": "2026-04-03", "type": "holiday"}

Text: "${raw}"`,
        }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.content?.[0]?.text?.trim();
    if (!content) return null;

    const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);
    if (!parsed.title || !parsed.date) return null;
    return { title: parsed.title, date: parsed.date, type: parsed.type || "custom" };
  } catch {
    return null;
  }
}
