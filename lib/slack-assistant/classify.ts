/**
 * Intent classification using Claude Haiku.
 * Single call that both classifies the intent AND extracts structured parameters.
 */

import { ClassificationResult, SlackIntent } from "./types";
import { applyVoiceCorrections } from "./voice-corrections";
import { getLangfuse, flushLangfuse } from "@/lib/langfuse";

/**
 * Classify a Slack message into an intent and extract relevant entities.
 */
export async function classifyIntent(
  rawText: string,
  teamMemberNames: string[],
  clientNames: string[]
): Promise<ClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { intent: "unknown", confidence: 0, data: {} };
  }

  const text = applyVoiceCorrections(rawText);

  // Fast path: single digit 1-10 → quote selection (no AI needed)
  const quoteMatch = text.trim().match(/^(\d{1,2})$/);
  if (quoteMatch) {
    const num = parseInt(quoteMatch[1]);
    if (num >= 1 && num <= 10) {
      return { intent: "quote_selection", confidence: 1.0, data: { number: num } };
    }
  }

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });

  const langfuse = getLangfuse();
  const trace = langfuse?.trace({ name: "slack-intent-classification" });
  const generation = trace?.generation({
    name: "classify-intent",
    model: "claude-haiku-4-5-20251001",
    input: { text: text.slice(0, 200) + (text.length > 200 ? "..." : "") },
  });

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
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are an intent classifier for a Slack assistant at a digital marketing agency called Choquer Agency. The owner sends voice-to-text messages (often messy grammar) and you must determine what they want.

TODAY: ${dayOfWeek}, ${todayStr}
TIMEZONE: America/Toronto (Eastern)
TEAM MEMBERS: ${teamMemberNames.join(", ")}
CLIENTS: ${clientNames.join(", ")}

VOICE-TO-TEXT NOTE: Messages may have misspellings. "Choker" = "Choquer". Match names to the closest from the lists above.

INTENTS (pick exactly one):

1. "meeting_transcript" — A meeting transcript, long dictation, or detailed task briefing with action items. Usually 300+ characters. Could be speaker turns from a meeting, OR a long detailed message describing work to be done for a project.

2. "quick_ticket" — Wants to create a new task/ticket. Phrases: "add a ticket", "create a task", "new ticket", "assign [person] to [task]", or describing a specific task. Also used for shorter task descriptions.

3. "modify_ticket" — Wants to change an existing ticket. Will reference a ticket number (CHQ-XXX) and mention changing something (due date, status, priority, assignee, title).

4. "status_check" — Asking about current state: "what's the status of CHQ-045", "what tickets does Sarah have", "how many open tickets", "what's overdue".

5. "announcement" — A message for the whole team. Phrases: "announce", "hey team", "reminder everyone", "office is closed", "let everyone know". Short team-wide messages.

6. "calendar_event" — Wants to add/manage a calendar event. Phrases: "add to calendar", "schedule", "team lunch on Thursday", "holiday on [date]".

7. "holiday_schedule" — Wants to change/move an existing calendar event or holiday. Phrases: "move the holiday", "change [event] from [date] to [date]", "reschedule".

8. "unknown" — Cannot determine intent. Ask for clarification.

RULES:
- Messages over 300 characters with conversational content → "meeting_transcript"
- If it mentions CHQ-XXX and asks about it → "status_check"
- If it mentions CHQ-XXX and wants to change something → "modify_ticket"
- "Hey team" or team-wide messages → "announcement"
- If unclear between announcement and quick_ticket, prefer "quick_ticket" if it mentions a specific person or task
- Resolve all relative dates to absolute dates (YYYY-MM-DD). "Today" = ${todayStr}, "tomorrow" = next day, "Friday" = upcoming Friday, "next Monday" = the Monday after this week.

Also determine these for ALL intents:
- "estimatedTicketCount": 1 or "many" — 1 if it's a single topic/project, "many" if it covers multiple unrelated items
- "expansionLevel": "none" | "light" | "full" — "none" = just extract what they said. "light" = detected from "clean it up", "help me structure this". "full" = detected from "help me expand", "you know better than I do", "make it detailed", "Claude help me write this".
- "hasLinks": true/false — whether URLs are present in the message

Return ONLY this JSON (no markdown fences):
{
  "intent": "one of the intent names above",
  "confidence": 0.0 to 1.0,
  "estimatedTicketCount": 1,
  "expansionLevel": "none",
  "hasLinks": false,
  "data": { ... intent-specific fields ... }
}

DATA FIELDS per intent:
- meeting_transcript: { "transcript": "the full message text" }
- quick_ticket: { "title": "short task title", "assigneeName": "name or null", "clientName": "name or null", "dueDate": "YYYY-MM-DD or null", "priority": "low|normal|high|urgent", "description": "details or null" }
- modify_ticket: { "ticketNumber": "CHQ-XXX", "changes": [{ "field": "due_date|status|priority|assignee|title", "newValue": "value" }] }
- status_check: { "ticketNumber": "CHQ-XXX or null", "teamMemberName": "name or null", "clientName": "name or null", "query": "what they're asking" }
- announcement: { "text": "the announcement message" }
- calendar_event: { "title": "event title", "date": "YYYY-MM-DD or null", "type": "holiday|event|custom" }
- holiday_schedule: { "title": "event name or null", "originalDate": "YYYY-MM-DD or null", "newDate": "YYYY-MM-DD or null" }
- unknown: { "reason": "why it's unclear" }

IMPORTANT: Use EXACT names from the team/client lists when matching. Never use the misspelled versions.

Message: "${text.replace(/"/g, '\\"')}"`,
        }],
      }),
    });

    if (!res.ok) {
      generation?.end({ output: `HTTP ${res.status}`, level: "ERROR" });
      await flushLangfuse();
      return { intent: "unknown", confidence: 0, data: {} };
    }

    const responseData = await res.json();
    const content = responseData.content?.[0]?.text?.trim();
    if (!content) {
      generation?.end({ output: "Empty response", level: "ERROR" });
      await flushLangfuse();
      return { intent: "unknown", confidence: 0, data: {} };
    }

    generation?.end({ output: content });
    await flushLangfuse();

    // Parse JSON (handle potential markdown fences)
    const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);

    return {
      intent: parsed.intent as SlackIntent,
      confidence: parsed.confidence ?? 0.8,
      data: parsed.data ?? {},
      estimatedTicketCount: parsed.estimatedTicketCount === "many" ? "many" : 1,
      expansionLevel: (parsed.expansionLevel as "none" | "light" | "full") || "none",
      hasLinks: parsed.hasLinks ?? false,
    };
  } catch (error) {
    console.error("Intent classification failed:", error);
    generation?.end({ output: String(error), level: "ERROR" });
    await flushLangfuse();
    return { intent: "unknown", confidence: 0, data: {} };
  }
}
