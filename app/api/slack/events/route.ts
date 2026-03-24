import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import crypto from "crypto";

/**
 * Slack Events API endpoint.
 * Handles:
 * 1. URL verification challenge (required by Slack during setup)
 * 2. DM messages from the owner → auto-create team announcements
 * 3. Emoji reactions on weekly quote messages → select the reacted quote
 */

// Verify Slack request signature
function verifySlackSignature(request: NextRequest, body: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const slackSignature = request.headers.get("x-slack-signature") || "";

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

// Get the owner's team_member_id and slack_user_id
async function getOwner(): Promise<{ id: number; slackUserId: string } | null> {
  const { rows } = await sql`
    SELECT id, slack_user_id FROM team_members
    WHERE role_level = 'owner' AND active = true
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return { id: rows[0].id as number, slackUserId: rows[0].slack_user_id as string };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify signature (skip in dev if no secret configured)
  if (process.env.SLACK_SIGNING_SECRET) {
    if (!verifySlackSignature(request, rawBody)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(rawBody);

  // 1. URL verification challenge
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // 2. Event callbacks
  if (payload.type === "event_callback") {
    const event = payload.event;

    // Handle DMs from owner → create announcement
    if (event.type === "message" && event.channel_type === "im" && !event.bot_id && !event.subtype) {
      const owner = await getOwner();
      if (!owner || event.user !== owner.slackUserId) {
        return NextResponse.json({ ok: true });
      }

      const messageText = (event.text || "").trim();
      const files = event.files || [];

      // Allow image-only messages (no text required if image attached)
      if (!messageText && files.length === 0) return NextResponse.json({ ok: true });

      // Check if this is a quote selection (e.g., "1", "3", emoji reaction)
      if (messageText && files.length === 0) {
        const quoteMatch = messageText.match(/^(\d{1,2})$/);
        if (quoteMatch) {
          const quoteNumber = parseInt(quoteMatch[1]);
          await handleQuoteSelection(quoteNumber, owner.id);
          return NextResponse.json({ ok: true });
        }
      }

      // Check for "remove from calendar"
      const removeMatch = messageText.match(/^remove (?:from )?calendar[:\s-]*(.+)/i);
      if (removeMatch) {
        const searchTitle = removeMatch[1].trim();
        await sql`DELETE FROM calendar_events WHERE LOWER(title) LIKE ${`%${searchTitle.toLowerCase()}%`}`;
        try {
          const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
          if (token) {
            await fetch("https://slack.com/api/reactions.add", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ channel: event.channel, timestamp: event.ts, name: "wastebasket" }),
            });
          }
        } catch {}
        return NextResponse.json({ ok: true });
      }

      // Check if this is a calendar event — flexible matching
      const calendarMatch = messageText.match(/^(?:add to calendar|add calendar|calendar)[:\s-]*(.+)/i);
      if (calendarMatch) {
        const calendarText = calendarMatch[1].trim();
        const parsed = await parseCalendarEvent(calendarText);
        if (parsed) {
          await sql`
            INSERT INTO calendar_events (title, event_date, event_type)
            VALUES (${parsed.title}, ${parsed.date}, ${parsed.type})
          `;
          // Acknowledge
          try {
            const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
            if (token) {
              await fetch("https://slack.com/api/reactions.add", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ channel: event.channel, timestamp: event.ts, name: "calendar" }),
              });
            }
          } catch {}
          return NextResponse.json({ ok: true });
        }
      }

      // Clean up the message with Claude AI + extract expiry
      const { text: cleanedText, expiresAt } = messageText
        ? await polishAnnouncement(messageText)
        : { text: "", expiresAt: null };

      // Download and save image if attached
      let imageUrl = "";
      if (files.length > 0) {
        const file = files[0];
        if (file.mimetype?.startsWith("image/") && file.url_private) {
          imageUrl = await downloadSlackImage(file.url_private, file.name || "image.png");
        }
      }

      // Create a team announcement
      await sql`
        INSERT INTO announcements (author_id, title, content, source, announcement_type, expires_at, image_url)
        VALUES (${owner.id}, ${cleanedText}, '', 'slack', 'general', ${expiresAt}, ${imageUrl})
      `;

      // Acknowledge via Slack reaction
      try {
        const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
        if (token) {
          await fetch("https://slack.com/api/reactions.add", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: event.channel, timestamp: event.ts, name: "white_check_mark" }),
          });
        }
      } catch {
        // Non-critical
      }

      return NextResponse.json({ ok: true });
    }

    // Handle emoji reaction on quote messages → select that quote
    if (event.type === "reaction_added" && event.item?.type === "message") {
      const owner = await getOwner();
      if (!owner || event.user !== owner.slackUserId) {
        return NextResponse.json({ ok: true });
      }

      // Map emoji names to numbers (1-10)
      const emojiToNumber: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5,
        six: 6, seven: 7, eight: 8, nine: 9, keycap_ten: 10,
        "1️⃣": 1, "2️⃣": 2, "3️⃣": 3, "4️⃣": 4, "5️⃣": 5,
        "6️⃣": 6, "7️⃣": 7, "8️⃣": 8, "9️⃣": 9, "🔟": 10,
      };

      const quoteNumber = emojiToNumber[event.reaction];
      if (quoteNumber) {
        await handleQuoteSelection(quoteNumber, owner.id);
      }

      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true });
}

async function parseCalendarEvent(raw: string): Promise<{ title: string; date: string; type: string } | null> {
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

async function downloadSlackImage(slackUrl: string, filename: string): Promise<string> {
  try {
    // Download from Slack (requires auth)
    const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
    if (!token) return "";

    const res = await fetch(slackUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return "";

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/png";

    // Try Vercel Blob (production)
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(`announcements/${Date.now()}-${filename}`, buffer, {
        access: "public",
        contentType,
      });
      return blob.url;
    }

    // Fallback: save locally
    const fs = await import("fs");
    const path = await import("path");
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const ext = filename.split(".").pop() || "png";
    const savedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, savedName), buffer);
    return `/uploads/${savedName}`;
  } catch (err) {
    console.error("Failed to download Slack image:", err);
    return "";
  }
}

async function polishAnnouncement(raw: string): Promise<{ text: string; expiresAt: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: raw, expiresAt: null };

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });

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
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `You are processing a team announcement for a company bulletin board. Do two things:

1. Clean up the text: fix spelling/grammar, make it sound personable and professional. Keep the same meaning and tone. Concise — one or two sentences max. Do NOT add emojis. IMPORTANT: If the message references a relative date like "next monday", "this friday", "tomorrow", always resolve it to the actual date and include it in the text. Format as "Day (Mon DD)" — for example "Monday (Mar 31)" or "Friday (Apr 3)". Never leave vague date references.

2. Extract an expiry datetime: When should this announcement disappear? Add 1 hour buffer after any mentioned end time. If only a date is mentioned, expire at end of that day (11:59 PM). If no date/time is mentioned, expire at end of today.

Today is ${dayOfWeek}, ${todayStr}. The current time is ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}.
The timezone is America/Toronto (Eastern).

Respond in EXACTLY this JSON format, nothing else:
{"text": "cleaned announcement text", "expires_at": "2026-03-28T14:00:00-04:00"}

Original message: "${raw}"`,
        }],
      }),
    });

    if (!res.ok) return { text: raw, expiresAt: null };
    const data = await res.json();
    const content = data.content?.[0]?.text?.trim();
    if (!content) return { text: raw, expiresAt: null };

    try {
      // Strip markdown code fences if present
      const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(jsonStr);
      return {
        text: parsed.text || raw,
        expiresAt: parsed.expires_at || null,
      };
    } catch {
      // If Claude didn't return valid JSON, use the raw text
      return { text: content, expiresAt: null };
    }
  } catch {
    return { text: raw, expiresAt: null };
  }
}

async function handleQuoteSelection(quoteNumber: number, ownerId: number) {
  // Get the most recent batch of quotes (current week)
  const { rows: quotes } = await sql`
    SELECT id, week_start FROM weekly_quotes
    WHERE week_start = (SELECT MAX(week_start) FROM weekly_quotes)
    ORDER BY id ASC
  `;

  if (quoteNumber < 1 || quoteNumber > quotes.length) return;

  const selectedQuote = quotes[quoteNumber - 1];
  if (!selectedQuote) return;

  // Deselect all quotes for this week, then select the chosen one
  await sql`UPDATE weekly_quotes SET selected = false WHERE week_start = ${selectedQuote.week_start}`;
  await sql`UPDATE weekly_quotes SET selected = true WHERE id = ${selectedQuote.id}`;

  // Acknowledge via Slack
  try {
    const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
    const owner = await getOwner();
    if (token && owner) {
      const { sendSlackDM } = await import("@/lib/slack");
      await sendSlackDM(owner.slackUserId, `Quote #${quoteNumber} selected for this week's bulletin!`);
    }
  } catch {
    // Non-critical
  }
}
