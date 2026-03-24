import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { checkRunawayTimers, getClientHourCap } from "@/lib/time-entries";
import { getTicketAssignees } from "@/lib/tickets";
import { deleteOldNotifications } from "@/lib/notifications";
import {
  notifyDueSoon,
  notifyOverdue,
  notifyRunawayTimer,
  notifyHourCap,
} from "@/lib/notification-triggers";

export async function GET(request: NextRequest) {
  // Verify cron secret (skip in dev for manual testing)
  const authHeader = request.headers.get("authorization");
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    dueSoon: 0,
    overdue: 0,
    runaway: 0,
    hourCap: 0,
    cleaned: 0,
  };

  try {
    // 1. Due soon — tickets due within 24 hours
    const { rows: dueSoonRows } = await sql`
      SELECT id, ticket_number, title, created_by_id FROM tickets
      WHERE due_date = CURRENT_DATE + INTERVAL '1 day'
        AND archived = false AND status != 'closed'
    `;
    for (const row of dueSoonRows) {
      const assignees = await getTicketAssignees(row.id as number);
      const assigneeIds = assignees.map((a) => a.teamMemberId);
      if (assigneeIds.length > 0) {
        await notifyDueSoon(
          row.id as number,
          row.ticket_number as string,
          row.title as string,
          assigneeIds
        );
        results.dueSoon++;
      }
    }

    // 2. Overdue — tickets past due date
    const { rows: overdueRows } = await sql`
      SELECT id, ticket_number, title, created_by_id FROM tickets
      WHERE due_date < CURRENT_DATE
        AND archived = false AND status != 'closed'
    `;
    for (const row of overdueRows) {
      const assignees = await getTicketAssignees(row.id as number);
      const assigneeIds = assignees.map((a) => a.teamMemberId);
      await notifyOverdue(
        row.id as number,
        row.ticket_number as string,
        row.title as string,
        (row.created_by_id as number) ?? null,
        assigneeIds
      );
      results.overdue++;
    }

    // 3. Runaway timers — running > 10 hours
    const runawayTimers = await checkRunawayTimers();
    for (const entry of runawayTimers) {
      await notifyRunawayTimer(
        entry.ticketId,
        entry.ticketNumber || "",
        entry.ticketTitle || "",
        entry.teamMemberId
      );
      results.runaway++;
    }

    // 4. Hour caps — check all clients with active tickets
    const { rows: clientRows } = await sql`
      SELECT DISTINCT t.client_id, c.name AS client_name
      FROM tickets t
      JOIN clients c ON c.id = t.client_id
      WHERE t.archived = false AND t.status != 'closed' AND t.client_id IS NOT NULL
    `;
    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    for (const row of clientRows) {
      const summary = await getClientHourCap(
        row.client_id as number,
        currentMonth
      );
      if (summary.status === "warning" || summary.status === "exceeded") {
        await notifyHourCap(
          summary.clientId,
          summary.clientName,
          summary.percentUsed,
          summary.status
        );
        results.hourCap++;
      }
    }

    // 5. Cleanup old read notifications
    results.cleaned = await deleteOldNotifications(90);

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[cron/notifications] Error:", err);
    return NextResponse.json(
      { error: "Cron failed", detail: String(err) },
      { status: 500 }
    );
  }
}
