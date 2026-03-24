import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { after } from "next/server";
import crypto from "crypto";
import { handleOwnerMessage } from "@/lib/slack-assistant";
import { handleQuoteSelection } from "@/lib/slack-assistant/handlers/quote-selection";
import { getConversation } from "@/lib/slack-assistant/conversation";

/**
 * Slack Events API endpoint.
 * Thin dispatcher — verifies signature, returns 200 OK immediately,
 * then processes via after() for async handling.
 */

function verifySlackSignature(request: NextRequest, body: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const slackSignature = request.headers.get("x-slack-signature") || "";

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

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

  if (process.env.SLACK_SIGNING_SECRET) {
    if (!verifySlackSignature(request, rawBody)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(rawBody);

  // URL verification challenge
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === "event_callback") {
    const event = payload.event;

    // DM messages from owner → route through intent classifier
    if (event.type === "message" && event.channel_type === "im" && !event.bot_id && !event.subtype) {
      // Return 200 immediately, process async
      after(async () => {
        try {
          const owner = await getOwner();
          if (!owner || event.user !== owner.slackUserId) return;

          await handleOwnerMessage(event, owner);
        } catch (err) {
          console.error("Slack assistant error:", err);
        }
      });

      return NextResponse.json({ ok: true });
    }

    // Emoji reactions — quote selection or conversation approval
    if (event.type === "reaction_added" && event.item?.type === "message") {
      after(async () => {
        try {
          const owner = await getOwner();
          if (!owner || event.user !== owner.slackUserId) return;

          // Check if this reaction is on a conversation thread (approval flow)
          const itemTs = event.item.ts;
          const conversation = await getConversation(itemTs);
          if (conversation) {
            // Thumbsup/checkmark reactions count as approval
            const approvalEmojis = ["+1", "thumbsup", "white_check_mark", "heavy_check_mark"];
            if (approvalEmojis.includes(event.reaction)) {
              await handleOwnerMessage({
                text: "approve",
                channel: event.item.channel,
                ts: event.event_ts || itemTs,
                thread_ts: conversation.threadTs,
                user: event.user,
              }, owner);
            }
            return;
          }

          // Otherwise, check for quote selection via emoji
          const emojiToNumber: Record<string, number> = {
            one: 1, two: 2, three: 3, four: 4, five: 5,
            six: 6, seven: 7, eight: 8, nine: 9, keycap_ten: 10,
          };
          const quoteNumber = emojiToNumber[event.reaction];
          if (quoteNumber) {
            await handleQuoteSelection(quoteNumber, owner);
          }
        } catch (err) {
          console.error("Slack reaction handler error:", err);
        }
      });

      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true });
}
