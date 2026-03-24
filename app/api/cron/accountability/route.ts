import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { autoResolveMissedCommitments, autoResolveMetCommitments } from "@/lib/commitments";
import { createNotification, createBulkNotifications } from "@/lib/notifications";

export async function GET() {
  try {
    const convex = getConvexClient();

    // 1. Auto-resolve: mark missed and met commitments
    const missed = await autoResolveMissedCommitments();
    const met = await autoResolveMetCommitments();

    // 2. Get all active tickets and their commitments for "due today" notifications
    const allTickets = await convex.query(api.tickets.list);
    const todayStr = new Date().toISOString().split("T")[0];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    // Collect all commitments across all tickets
    const dueTodayItems: Array<{ teamMemberId: string; ticketId: string; ticketNumber: string; title: string }> = [];
    const justMissedItems: Array<{ teamMemberId: string; ticketId: string; ticketNumber: string; title: string; missCount: number }> = [];

    for (const ticket of allTickets) {
      const commitments = await convex.query(api.commitments.listByTicket, {
        ticketId: ticket._id as any,
      });

      for (const c of commitments) {
        // Due today
        if (c.status === "active" && (c as any).committedDate === todayStr) {
          dueTodayItems.push({
            teamMemberId: (c as any).teamMemberId,
            ticketId: ticket._id,
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
          });
        }

        // Just missed (resolved within last day)
        if (c.status === "missed" && c.resolvedAt && c.resolvedAt > oneDayAgo) {
          // Count total misses for this member on this ticket
          const missCount = commitments.filter(
            (cc: any) => cc.teamMemberId === (c as any).teamMemberId && cc.status === "missed"
          ).length;

          justMissedItems.push({
            teamMemberId: (c as any).teamMemberId,
            ticketId: ticket._id,
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            missCount,
          });
        }
      }
    }

    // Notify: commitments due today
    for (const item of dueTodayItems) {
      await createNotification(
        item.teamMemberId as any,
        item.ticketId as any,
        "due_soon",
        `Commitment due today: ${item.ticketNumber}`,
        item.title,
        `/admin/tickets?ticket=${item.ticketId}`
      );
    }

    // Notify: just missed commitments
    const allMembers = await convex.query(api.teamMembers.list);
    const admins = allMembers.filter(
      (m: any) => ["owner", "c_suite"].includes(m.roleLevel) && m.active
    );
    const adminIds = admins.map((a: any) => a._id);

    for (const item of justMissedItems) {
      // Notify the team member
      await createNotification(
        item.teamMemberId as any,
        item.ticketId as any,
        "overdue",
        `Missed commitment on ${item.ticketNumber}`,
        item.missCount > 1
          ? `This is miss #${item.missCount}. Please set a new commitment date.`
          : `${item.title} — please set a new date.`,
        `/admin/tickets?ticket=${item.ticketId}`
      );

      // If 2+ misses, also notify admins
      if (item.missCount >= 2) {
        const filteredAdminIds = adminIds.filter((id: string) => id !== item.teamMemberId);
        if (filteredAdminIds.length > 0) {
          await createBulkNotifications(
            filteredAdminIds,
            item.ticketId as any,
            "overdue",
            `${item.ticketNumber} — ${item.missCount} missed commitments`,
            `${item.title} needs attention`,
            `/admin/tickets?ticket=${item.ticketId}`
          );
        }
      }
    }

    // 4. Notify owner: tickets overdue 14+ days with no active commitment
    const fourteenDaysAgoStr = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const longOverdue: typeof allTickets = [];
    for (const ticket of allTickets) {
      if (["closed", "approved_go_live"].includes(ticket.status)) continue;
      if (ticket.archived) continue;
      if (!ticket.dueDate || ticket.dueDate >= fourteenDaysAgoStr) continue;
      if ((ticket as any).parentTicketId) continue;

      // Check if ticket has active commitments
      const commitments = await convex.query(api.commitments.listByTicket, {
        ticketId: ticket._id as any,
      });
      const hasActive = commitments.some((c: any) => c.status === "active");
      if (!hasActive) {
        longOverdue.push(ticket);
      }
      if (longOverdue.length >= 20) break;
    }

    if (longOverdue.length > 0) {
      for (const ticket of longOverdue) {
        const daysOverdue = Math.ceil((Date.now() - new Date(ticket.dueDate as string).getTime()) / (1000 * 60 * 60 * 24));
        await createBulkNotifications(
          adminIds,
          ticket._id as any,
          "overdue",
          `${ticket.ticketNumber} — ${daysOverdue} days overdue, no commitment`,
          ticket.title,
          `/admin/tickets?ticket=${ticket._id}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      resolved: { missed, met },
      notified: {
        dueToday: dueTodayItems.length,
        justMissed: justMissedItems.length,
        longOverdue: longOverdue.length,
      },
    });
  } catch (error) {
    console.error("[accountability cron] Error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
