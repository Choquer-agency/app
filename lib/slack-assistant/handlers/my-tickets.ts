/**
 * My Tickets handler.
 * Shows a team member their assigned tickets, grouped by status.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext } from "../types";
import { replyInThread, addSlackReaction } from "@/lib/slack";

export class MyTicketsHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { channelId, messageTs, user } = ctx;

    const convex = getConvexClient();

    // Get tickets assigned to this member
    const assignments = await convex.query(api.ticketAssignees.listByMember, {
      teamMemberId: user.id as any,
    });

    if (assignments.length === 0) {
      await replyInThread(channelId, messageTs, "You don't have any tickets assigned right now.");
      return;
    }

    const allTickets = await convex.query(api.tickets.list, {});
    const allClients = await convex.query(api.clients.list, {});
    const todayStr = new Date().toISOString().split("T")[0];

    // Get assigned tickets that aren't closed or archived
    const myTickets = assignments
      .map((a: any) => allTickets.find((t: any) => t._id === a.ticketId))
      .filter((t: any) => t && !t.archived && t.status !== "closed");

    if (myTickets.length === 0) {
      await replyInThread(channelId, messageTs, "All your tickets are closed or archived. Nice work!");
      return;
    }

    // Group by status
    const statusOrder = ["stuck", "needs_attention", "in_progress", "qa_ready", "client_review", "approved_go_live"];
    const statusLabels: Record<string, string> = {
      stuck: "Stuck",
      needs_attention: "Needs Attention",
      in_progress: "In Progress",
      qa_ready: "QA Ready",
      client_review: "Client Review",
      approved_go_live: "Ready to Go Live",
    };

    const grouped = new Map<string, any[]>();
    for (const ticket of myTickets) {
      const status = (ticket as any).status;
      if (!grouped.has(status)) grouped.set(status, []);
      grouped.get(status)!.push(ticket);
    }

    const lines: string[] = [];
    lines.push(`Hey ${user.name.split(" ")[0]}, here's your plate:\n`);

    let overdueCount = 0;

    for (const status of statusOrder) {
      const tickets = grouped.get(status);
      if (!tickets || tickets.length === 0) continue;

      lines.push(`*${statusLabels[status] || status}* (${tickets.length})`);
      for (const t of tickets) {
        const client = t.clientId ? allClients.find((c: any) => c._id === t.clientId) : null;
        const clientName = client ? ` | ${client.name}` : "";
        const dueStr = t.dueDate ? ` | Due: ${t.dueDate}` : "";
        const overdue = t.dueDate && t.dueDate < todayStr && ["needs_attention", "stuck", "in_progress"].includes(t.status);
        const overdueFlag = overdue ? " :warning: *OVERDUE*" : "";
        if (overdue) overdueCount++;
        lines.push(`  • ${t.ticketNumber}: ${t.title}${clientName}${dueStr}${overdueFlag}`);
      }
      lines.push("");
    }

    // Summary line
    const total = myTickets.length;
    const summary = overdueCount > 0
      ? `*${total} ticket${total !== 1 ? "s" : ""}* total, *${overdueCount} overdue*`
      : `*${total} ticket${total !== 1 ? "s" : ""}* total`;
    lines.push(summary);

    await replyInThread(channelId, messageTs, lines.join("\n"));
    await addSlackReaction(channelId, messageTs, "clipboard");
  }
}
