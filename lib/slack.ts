const SLACK_API_BASE = "https://slack.com/api";

interface SlackResponse {
  ok: boolean;
  ts?: string;
  error?: string;
  channel?: string;
}

/**
 * Send a Slack DM to a user.
 * Prefers SLACK_BOT_TOKEN (messages come from the bot, user gets notified).
 * Falls back to SLACK_USER_TOKEN (messages come from Bryce's account).
 */
export async function sendSlackDM(
  slackUserId: string,
  text: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
  if (!token) {
    console.error("No Slack token configured (SLACK_BOT_TOKEN or SLACK_USER_TOKEN)");
    return { ok: false, error: "No Slack token configured" };
  }

  const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: slackUserId,
      text,
      // Using mrkdwn so *bold* and bullet points render nicely
      mrkdwn: true,
    }),
  });

  const data: SlackResponse = await res.json();

  if (!data.ok) {
    console.error("Slack API error:", data.error);
  }

  return { ok: data.ok, ts: data.ts, error: data.error };
}

/**
 * Log a sent Slack message to the database for audit.
 */
export async function logSlackMessage(
  teamMemberId: number,
  messageType: string,
  messageText: string,
  slackTs?: string
): Promise<void> {
  const { sql } = await import("@vercel/postgres");
  await sql`
    INSERT INTO slack_messages (team_member_id, message_type, message_text, slack_ts)
    VALUES (${teamMemberId}, ${messageType}, ${messageText}, ${slackTs || ""})
  `;
}
