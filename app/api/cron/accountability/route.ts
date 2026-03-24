import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { autoResolveMissedCommitments, autoResolveMetCommitments } from "@/lib/commitments";
import { createNotification, createBulkNotifications } from "@/lib/notifications";

export async function GET() {
  try {
    // 1. Auto-resolve: mark missed and met commitments
    const missed = await autoResolveMissedCommitments();
    const met = await autoResolveMetCommitments();

    // 2. Notify: commitments due today
    const { rows: dueToday } = await sql`
      SELECT tc.id, tc.ticket_id, tc.team_member_id, tc.notes,
        t.ticket_number, t.title
      FROM ticket_commitments tc
      JOIN tickets t ON t.id = tc.ticket_id
      WHERE tc.status = 'active'
        AND tc.committed_date = CURRENT_DATE
    `;

    for (const row of dueToday) {
      await createNotification(
        row.team_member_id as number,
        row.ticket_id as number,
        "due_soon",
        `Commitment due today: ${row.ticket_number}`,
        row.title as string,
        `/admin/tickets?ticket=${row.ticket_id}`
      );
    }

    // 3. Notify: commitments that were just marked missed (yesterday's misses)
    const { rows: justMissed } = await sql`
      SELECT tc.ticket_id, tc.team_member_id,
        t.ticket_number, t.title,
        (SELECT COUNT(*) FROM ticket_commitments tc2
         WHERE tc2.ticket_id = tc.ticket_id
           AND tc2.team_member_id = tc.team_member_id
           AND tc2.status = 'missed') AS miss_count
      FROM ticket_commitments tc
      JOIN tickets t ON t.id = tc.ticket_id
      WHERE tc.status = 'missed'
        AND tc.resolved_at > NOW() - INTERVAL '1 day'
    `;

    for (const row of justMissed) {
      const missCount = Number(row.miss_count);

      // Notify the team member
      await createNotification(
        row.team_member_id as number,
        row.ticket_id as number,
        "overdue",
        `Missed commitment on ${row.ticket_number}`,
        missCount > 1
          ? `This is miss #${missCount}. Please set a new commitment date.`
          : `${row.title} — please set a new date.`,
        `/admin/tickets?ticket=${row.ticket_id}`
      );

      // If 2+ misses, also notify the owner (admins)
      if (missCount >= 2) {
        const { rows: admins } = await sql`
          SELECT id FROM team_members WHERE role_level IN ('owner', 'c_suite') AND active = true
        `;
        const adminIds = admins.map((a) => a.id as number).filter((id) => id !== (row.team_member_id as number));

        if (adminIds.length > 0) {
          await createBulkNotifications(
            adminIds,
            row.ticket_id as number,
            "overdue",
            `${row.ticket_number} — ${missCount} missed commitments`,
            `${row.title} needs attention`,
            `/admin/tickets?ticket=${row.ticket_id}`
          );
        }
      }
    }

    // 4. Notify owner: tickets overdue 14+ days with no active commitment
    const { rows: longOverdue } = await sql`
      SELECT t.id, t.ticket_number, t.title, t.due_date
      FROM tickets t
      WHERE t.status NOT IN ('closed', 'approved_go_live')
        AND t.archived = false
        AND t.due_date < CURRENT_DATE - INTERVAL '14 days'
        AND t.parent_ticket_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ticket_commitments tc
          WHERE tc.ticket_id = t.id AND tc.status = 'active'
        )
      LIMIT 20
    `;

    if (longOverdue.length > 0) {
      const { rows: admins } = await sql`
        SELECT id FROM team_members WHERE role_level IN ('owner', 'c_suite') AND active = true
      `;
      const adminIds = admins.map((a) => a.id as number);

      for (const row of longOverdue) {
        const daysOverdue = Math.ceil((Date.now() - new Date(row.due_date as string).getTime()) / (1000 * 60 * 60 * 24));
        await createBulkNotifications(
          adminIds,
          row.id as number,
          "overdue",
          `${row.ticket_number} — ${daysOverdue} days overdue, no commitment`,
          row.title as string,
          `/admin/tickets?ticket=${row.id}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      resolved: { missed, met },
      notified: {
        dueToday: dueToday.length,
        justMissed: justMissed.length,
        longOverdue: longOverdue.length,
      },
    });
  } catch (error) {
    console.error("[accountability cron] Error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
