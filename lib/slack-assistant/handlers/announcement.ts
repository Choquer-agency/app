/**
 * Announcement handler — migrated from the original route.ts.
 * Polishes the message with Claude AI, downloads images, creates announcement.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext } from "../types";
import { addSlackReaction } from "@/lib/slack";

export class AnnouncementHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, messageTs, files, owner } = ctx;

    // Polish the announcement with Claude AI
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

    // Create the announcement
    const convex = getConvexClient();
    await convex.mutation(api.bulletin.createAnnouncement, {
      authorId: owner.id as any,
      title: cleanedText,
      content: "",
      source: "slack",
      announcementType: "general",
      expiresAt: expiresAt || undefined,
      imageUrl,
    });

    // Acknowledge
    await addSlackReaction(channelId, messageTs, "white_check_mark");
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
      const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(jsonStr);
      return {
        text: parsed.text || raw,
        expiresAt: parsed.expires_at || null,
      };
    } catch {
      return { text: content, expiresAt: null };
    }
  } catch {
    return { text: raw, expiresAt: null };
  }
}

async function downloadSlackImage(slackUrl: string, filename: string): Promise<string> {
  try {
    const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
    if (!token) return "";

    const res = await fetch(slackUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return "";

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/png";

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(`announcements/${Date.now()}-${filename}`, buffer, {
        access: "public",
        contentType,
      });
      return blob.url;
    }

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
