import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { checkRunawayTimers, getClientHourCap } from "@/lib/time-entries";
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
    const convex = getConvexClient();

    // 1. Due soon — tickets due within 24 hours
    const allTickets = await convex.query(api.tickets.list);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    const todayStr = now.toISOString().split("T")[0];

    const dueSoonTickets = allTickets.filter(
      (t: any) => t.dueDate === tomorrowStr && !t.archived && t.status !== "closed"
    );

    for (const ticket of dueSoonTickets) {
      const assignees = await convex.query(api.ticketAssignees.listByTicket, {
        ticketId: ticket._id as any,
      });
      const assigneeIds = assignees.map((a: any) => a.teamMemberId);
      if (assigneeIds.length > 0) {
        await notifyDueSoon(
          ticket._id as any,
          ticket.ticketNumber as string,
          ticket.title as string,
          assigneeIds
        );
        results.dueSoon++;
      }
    }

    // 2. Overdue — tickets past due date
    const overdueTickets = allTickets.filter(
      (t: any) => t.dueDate && t.dueDate < todayStr && !t.archived && t.status !== "closed"
    );

    for (const ticket of overdueTickets) {
      const assignees = await convex.query(api.ticketAssignees.listByTicket, {
        ticketId: ticket._id as any,
      });
      const assigneeIds = assignees.map((a: any) => a.teamMemberId);
      await notifyOverdue(
        ticket._id as any,
        ticket.ticketNumber as string,
        ticket.title as string,
        (ticket as any).createdById ?? null,
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
    const clients = await convex.query(api.clients.list);
    const clientsWithActiveTickets = allTickets
      .filter((t: any) => !t.archived && t.status !== "closed" && t.clientId)
      .map((t: any) => t.clientId);
    const uniqueClientIds = [...new Set(clientsWithActiveTickets)];

    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
    for (const clientId of uniqueClientIds) {
      const client = clients.find((c: any) => c._id === clientId);
      if (!client) continue;

      const summary = await getClientHourCap(clientId as any, currentMonth);
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
