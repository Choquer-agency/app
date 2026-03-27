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
  text: string,
  threadTs?: string
): Promise<{ ok: boolean; ts?: string; channel?: string; error?: string }> {
  const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
  if (!token) {
    console.error("No Slack token configured (SLACK_BOT_TOKEN or SLACK_USER_TOKEN)");
    return { ok: false, error: "No Slack token configured" };
  }

  const body: Record<string, unknown> = {
    channel: slackUserId,
    text,
    mrkdwn: true,
  };
  if (threadTs) {
    body.thread_ts = threadTs;
  }

  const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data: SlackResponse = await res.json();

  if (!data.ok) {
    console.error("Slack API error:", data.error);
  }

  return { ok: data.ok, ts: data.ts, channel: data.channel, error: data.error };
}

/**
 * Reply in a Slack thread. Convenience wrapper around sendSlackDM.
 */
export async function replyInThread(
  channelId: string,
  threadTs: string,
  text: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  return sendSlackDM(channelId, text, threadTs);
}

/**
 * Add a reaction emoji to a Slack message.
 */
export async function addSlackReaction(
  channelId: string,
  messageTs: string,
  emoji: string
): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`${SLACK_API_BASE}/reactions.add`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        timestamp: messageTs,
        name: emoji,
      }),
    });
    const data: SlackResponse = await res.json();
    return data.ok;
  } catch {
    return false;
  }
}

/**
 * Log a sent Slack message to the database for audit.
 */
export async function logSlackMessage(
  teamMemberId: string,
  messageType: string,
  messageText: string,
  slackTs?: string,
  channelId?: string,
  data?: Record<string, unknown>
): Promise<void> {
  const { getConvexClient } = await import("./convex-server");
  const { api } = await import("@/convex/_generated/api");
  const convex = getConvexClient();
  await convex.mutation(api.slackMessages.create, {
    teamMemberId: teamMemberId as any,
    messageType,
    messageText,
    slackTs,
    channelId,
    data,
  });
}
