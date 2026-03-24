/**
 * Status check handler.
 * Queries tickets/workload and responds with formatted info.
 */

import { sql } from "@vercel/postgres";
import { IntentHandler, HandlerContext, StatusCheckData } from "../types";
import { replyInThread, addSlackReaction } from "@/lib/slack";
import { getTicketByNumber, getTickets } from "@/lib/tickets";

export class StatusCheckHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { channelId, messageTs, classification } = ctx;
    const data = classification?.data as StatusCheckData | undefined;

    // Specific ticket lookup
    if (data?.ticketNumber) {
      await this.handleTicketStatus(ctx, data.ticketNumber);
      return;
    }

    // Team member workload
    if (data?.teamMemberName) {
      await this.handleMemberWorkload(ctx, data.teamMemberName);
      return;
    }

    // Client tickets
    if (data?.clientName) {
      await this.handleClientTickets(ctx, data.clientName);
      return;
    }

    // General query
    await replyInThread(channelId, messageTs, "Could you be more specific? For example:\n• \"What's the status of CHQ-045?\"\n• \"What tickets does Sarah have?\"\n• \"What's open for FitFuel?\"");
  }

  private async handleTicketStatus(ctx: HandlerContext, ticketNumber: string): Promise<void> {
    const { channelId, messageTs } = ctx;
    const ticket = await getTicketByNumber(ticketNumber);

    if (!ticket) {
      await replyInThread(channelId, messageTs, `Couldn't find *${ticketNumber}*.`);
      return;
    }

    const assigneeNames = ticket.assignees?.map((a) => a.memberName).join(", ") || "Unassigned";
    const status = ticket.status.replace(/_/g, " ");
    const lines = [
      `*${ticket.ticketNumber}*: ${ticket.title}`,
      `Status: ${status} | Priority: ${ticket.priority}`,
      `Assignee: ${assigneeNames}`,
      `Client: ${ticket.clientName || "Internal"}`,
    ];
    if (ticket.dueDate) lines.push(`Due: ${ticket.dueDate}`);
    if (ticket.createdAt) lines.push(`Created: ${new Date(ticket.createdAt).toLocaleDateString()}`);

    await replyInThread(channelId, messageTs, lines.join("\n"));
    await addSlackReaction(channelId, messageTs, "mag");
  }

  private async handleMemberWorkload(ctx: HandlerContext, memberName: string): Promise<void> {
    const { channelId, messageTs } = ctx;

    const { rows: memberRows } = await sql`
      SELECT id, name FROM team_members
      WHERE active = true AND LOWER(name) LIKE ${`%${memberName.toLowerCase()}%`}
      LIMIT 1
    `;

    if (memberRows.length === 0) {
      await replyInThread(channelId, messageTs, `Couldn't find a team member matching "${memberName}".`);
      return;
    }

    const member = memberRows[0] as { id: number; name: string };
    const tickets = await getTickets({ assigneeId: member.id, archived: false });

    if (tickets.length === 0) {
      await replyInThread(channelId, messageTs, `*${member.name}* has no open tickets.`);
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const overdue = tickets.filter((t) => t.dueDate && t.dueDate < today && t.status !== "closed");
    const dueThisWeek = tickets.filter((t) => {
      if (!t.dueDate || t.status === "closed") return false;
      const due = new Date(t.dueDate);
      const endOfWeek = new Date();
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
      return t.dueDate >= today && due <= endOfWeek;
    });
    const open = tickets.filter((t) => t.status !== "closed");

    const lines = [`*${member.name}*: ${open.length} open ticket${open.length !== 1 ? "s" : ""}`];

    if (overdue.length > 0) {
      lines.push(`\n*Overdue (${overdue.length}):*`);
      overdue.slice(0, 5).forEach((t) => {
        lines.push(`• ${t.ticketNumber}: ${t.title} (due ${t.dueDate})`);
      });
      if (overdue.length > 5) lines.push(`  _...and ${overdue.length - 5} more_`);
    }

    if (dueThisWeek.length > 0) {
      lines.push(`\n*Due this week (${dueThisWeek.length}):*`);
      dueThisWeek.slice(0, 5).forEach((t) => {
        lines.push(`• ${t.ticketNumber}: ${t.title} (due ${t.dueDate})`);
      });
    }

    await replyInThread(channelId, messageTs, lines.join("\n"));
    await addSlackReaction(channelId, messageTs, "mag");
  }

  private async handleClientTickets(ctx: HandlerContext, clientName: string): Promise<void> {
    const { channelId, messageTs } = ctx;

    const { rows: clientRows } = await sql`
      SELECT id, name FROM clients
      WHERE active = true AND LOWER(name) LIKE ${`%${clientName.toLowerCase()}%`}
      LIMIT 1
    `;

    if (clientRows.length === 0) {
      await replyInThread(channelId, messageTs, `Couldn't find a client matching "${clientName}".`);
      return;
    }

    const client = clientRows[0] as { id: number; name: string };
    const tickets = await getTickets({ clientId: client.id, archived: false });
    const open = tickets.filter((t) => t.status !== "closed");

    if (open.length === 0) {
      await replyInThread(channelId, messageTs, `No open tickets for *${client.name}*.`);
      return;
    }

    const lines = [`*${client.name}*: ${open.length} open ticket${open.length !== 1 ? "s" : ""}`];
    open.slice(0, 10).forEach((t) => {
      const due = t.dueDate ? ` (due ${t.dueDate})` : "";
      const status = t.status.replace(/_/g, " ");
      lines.push(`• ${t.ticketNumber}: ${t.title} — ${status}${due}`);
    });
    if (open.length > 10) lines.push(`_...and ${open.length - 10} more_`);

    await replyInThread(channelId, messageTs, lines.join("\n"));
    await addSlackReaction(channelId, messageTs, "mag");
  }
}
