import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { autoResolveMissedCommitments, autoResolveMetCommitments } from "@/lib/commitments";
import { sendSlackDM, logSlackMessage } from "@/lib/slack";

export async function GET() {
  try {
    // 1. Auto-resolve: mark missed and met commitments first
    const missed = await autoResolveMissedCommitments();
    const met = await autoResolveMetCommitments();

    // 2. Get all active team members (not just those with Slack)
    const { rows: members } = await sql`
      SELECT id, name FROM team_members WHERE active = true
      ORDER BY (LOWER(email) = 'bryce@choquer.agency') DESC, name
    `;

    // 3. For each member, calculate last week's commitment stats
    const memberSummaries: Array<{
      name: string;
      total: number;
      metCount: number;
      missedCount: number;
      activeCount: number;
      reliability: number;
      missedItems: Array<{ ticketNumber: string; title: string }>;
    }> = [];

    for (const member of members) {
      const memberId = member.id as number;
      const memberName = member.name as string;

      // Commitments resolved in the last 7 days
      const { rows: resolved } = await sql`
        SELECT tc.status, t.ticket_number, t.title
        FROM ticket_commitments tc
        JOIN tickets t ON t.id = tc.ticket_id
        WHERE tc.team_member_id = ${memberId}
          AND tc.resolved_at > NOW() - INTERVAL '7 days'
      `;

      // Active commitments (still pending)
      const { rows: active } = await sql`
        SELECT COUNT(*) AS count
        FROM ticket_commitments tc
        WHERE tc.team_member_id = ${memberId}
          AND tc.status = 'active'
      `;

      const metCount = resolved.filter((r) => r.status === "met").length;
      const missedCount = resolved.filter((r) => r.status === "missed").length;
      const activeCount = Number(active[0]?.count || 0);
      const total = metCount + missedCount;
      const reliability = total > 0 ? Math.round((metCount / total) * 100) : -1;

      const missedItems = resolved
        .filter((r) => r.status === "missed")
        .map((r) => ({
          ticketNumber: r.ticket_number as string,
          title: r.title as string,
        }));

      // Only include members who had commitments
      if (total > 0 || activeCount > 0) {
        memberSummaries.push({
          name: memberName,
          total,
          metCount,
          missedCount,
          activeCount,
          reliability,
          missedItems,
        });
      }
    }

    // 4. Compose summary message for the owner
    if (memberSummaries.length === 0) {
      return NextResponse.json({
        success: true,
        sent: false,
        reason: "No commitments to summarize",
        resolved: { missed, met },
      });
    }

    const lines: string[] = [];
    lines.push("*Weekly recap before Monday meetings:*\n");

    for (const s of memberSummaries) {
      const reliabilityStr =
        s.reliability >= 0 ? `(${s.reliability}%)` : "";
      const emoji =
        s.reliability === 100
          ? " :fire:"
          : s.reliability >= 80
          ? ""
          : s.reliability >= 0
          ? " :warning:"
          : "";

      lines.push(
        `*${s.name}* — ${s.total} commitment${s.total !== 1 ? "s" : ""}, ${s.metCount} met, ${s.missedCount} missed ${reliabilityStr}${emoji}`
      );

      if (s.missedItems.length > 0) {
        for (const item of s.missedItems) {
          lines.push(`  :x: ${item.ticketNumber}: ${item.title}`);
        }
      }

      if (s.activeCount > 0) {
        lines.push(`  _${s.activeCount} still active_`);
      }

      lines.push("");
    }

    const message = lines.join("\n");

    // 5. Send to owner (Bryce)
    const { rows: owners } = await sql`
      SELECT id, slack_user_id FROM team_members
      WHERE role_level = 'owner' AND active = true AND slack_user_id != ''
      LIMIT 1
    `;

    let sent = false;
    if (owners.length > 0) {
      const ownerId = owners[0].id as number;
      const ownerSlackId = owners[0].slack_user_id as string;

      const result = await sendSlackDM(ownerSlackId, message);
      if (result.ok) {
        await logSlackMessage(ownerId, "weekly_summary", message, result.ts);
        sent = true;
      } else {
        console.error("[weekly-summary] Failed to send to owner:", result.error);
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      summaries: memberSummaries.length,
      resolved: { missed, met },
    });
  } catch (error) {
    console.error("[weekly-summary cron] Error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
