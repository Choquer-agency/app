import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { sendSlackDM, logSlackMessage } from "@/lib/slack";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface DueItem {
  ticket_id: number;
  ticket_number: string;
  title: string;
  client_name: string | null;
  source: "commitment" | "due_date";
}

export async function GET() {
  try {
    // Get active team members with Slack configured
    const { rows: members } = await sql`
      SELECT id, name, slack_user_id
      FROM team_members
      WHERE active = true AND slack_user_id != '' AND slack_user_id IS NOT NULL
    `;

    if (members.length === 0) {
      return NextResponse.json({ success: true, sent: 0, reason: "No members with Slack configured" });
    }

    let sentCount = 0;

    for (const member of members) {
      const memberId = member.id as number;
      const memberName = (member.name as string).split(" ")[0]; // First name
      const slackId = member.slack_user_id as string;

      // Get tickets due today (commitments + due dates)
      const { rows: commitmentsDueToday } = await sql`
        SELECT DISTINCT t.id AS ticket_id, t.ticket_number, t.title,
          c.name AS client_name, 'commitment' AS source
        FROM ticket_commitments tc
        JOIN tickets t ON t.id = tc.ticket_id
        LEFT JOIN clients c ON c.id = t.client_id
        WHERE tc.team_member_id = ${memberId}
          AND tc.status = 'active'
          AND tc.committed_date = CURRENT_DATE
          AND t.status NOT IN ('closed', 'approved_go_live')
          AND t.archived = false
      `;

      const { rows: ticketsDueToday } = await sql`
        SELECT DISTINCT t.id AS ticket_id, t.ticket_number, t.title,
          c.name AS client_name, 'due_date' AS source
        FROM tickets t
        JOIN ticket_assignees ta ON ta.ticket_id = t.id
        LEFT JOIN clients c ON c.id = t.client_id
        WHERE ta.team_member_id = ${memberId}
          AND t.due_date = CURRENT_DATE
          AND t.status NOT IN ('closed', 'approved_go_live')
          AND t.archived = false
      `;

      // Deduplicate by ticket_id (a ticket could be both committed and due today)
      const seen = new Set<number>();
      const allItems: DueItem[] = [];

      for (const row of [...commitmentsDueToday, ...ticketsDueToday]) {
        const ticketId = row.ticket_id as number;
        if (!seen.has(ticketId)) {
          seen.add(ticketId);
          allItems.push({
            ticket_id: ticketId,
            ticket_number: row.ticket_number as string,
            title: row.title as string,
            client_name: (row.client_name as string) || null,
            source: row.source as "commitment" | "due_date",
          });
        }
      }

      // Skip if nothing to report
      if (allItems.length === 0) continue;

      // Group by client
      const byClient = new Map<string, DueItem[]>();
      for (const item of allItems) {
        const key = item.client_name || "Internal";
        if (!byClient.has(key)) byClient.set(key, []);
        byClient.get(key)!.push(item);
      }

      // Compose message
      const dayName = DAYS[new Date().getDay()];
      const lines: string[] = [];
      lines.push(`Hey ${memberName}, quick EOD check-in for ${dayName}:\n`);

      for (const [client, items] of byClient) {
        lines.push(`*${client}*`);
        for (const item of items) {
          lines.push(`• ${item.ticket_number}: ${item.title}`);
        }
        lines.push("");
      }

      lines.push("How are things looking?");

      const message = lines.join("\n");

      // Send via Slack
      const result = await sendSlackDM(slackId, message);
      if (result.ok) {
        await logSlackMessage(memberId, "eod_checkin", message, result.ts);
        sentCount++;
      } else {
        console.error(`[eod-checkin] Failed to send to ${memberName}:`, result.error);
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      totalMembers: members.length,
    });
  } catch (error) {
    console.error("[eod-checkin cron] Error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
