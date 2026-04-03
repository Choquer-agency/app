/**
 * Modify ticket handler.
 * Updates an existing ticket by CHQ number.
 * Executes immediately — no confirmation required.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext, ModifyTicketData } from "../types";
import { replyInThread, addSlackReaction } from "@/lib/slack";
import { getTicketByNumber, updateTicket, addAssignee } from "@/lib/tickets";

export class ModifyTicketHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { channelId, messageTs, threadTs, user, classification } = ctx;
    const replyTs = threadTs || messageTs;
    const data = classification?.data as ModifyTicketData | undefined;

    if (!data?.ticketNumber) {
      await replyInThread(channelId, replyTs, "I couldn't find a ticket number in your message. Please include a CHQ number (e.g., CHQ-045).");
      return;
    }

    const ticket = await getTicketByNumber(data.ticketNumber);
    if (!ticket) {
      await replyInThread(channelId, replyTs, `I couldn't find ticket *${data.ticketNumber}*. Double-check the number?`);
      return;
    }

    // Non-owner users can only modify tickets assigned to them
    if (!user.isOwner) {
      const convex = getConvexClient();
      const assignees = await convex.query(api.ticketAssignees.listByTicket, { ticketId: ticket.id as any });
      const isAssigned = (assignees as any[]).some((a: any) => a.teamMemberId === user.id);
      if (!isAssigned) {
        await replyInThread(channelId, replyTs, `You can only modify tickets assigned to you. *${data.ticketNumber}* isn't assigned to you.`);
        return;
      }

      const allowedFields = ["status", "due_date"];
      const restricted = data.changes?.filter((c) => !allowedFields.includes(c.field));
      if (restricted && restricted.length > 0) {
        await replyInThread(channelId, replyTs, `You can change the status or due date of your tickets. For other changes, ask your team lead.`);
        return;
      }
    }

    const changes = data.changes || [];
    if (changes.length === 0) {
      await replyInThread(channelId, replyTs, `Found *${ticket.ticketNumber}*: ${ticket.title}\n\nWhat would you like to change? (${user.isOwner ? "due date, status, priority, assignee, title" : "status, due date"})`);
      return;
    }

    // Execute changes immediately
    const actor = { id: user.id as any, name: `${user.name} (via Slack)` };
    const updateData: Record<string, unknown> = {};
    const results: string[] = [];

    for (const change of changes) {
      switch (change.field) {
        case "due_date":
          updateData.dueDate = change.newValue;
          results.push(`due date → ${change.newValue}`);
          break;
        case "status":
          updateData.status = change.newValue;
          results.push(`status → ${change.newValue.replace(/_/g, " ")}`);
          break;
        case "priority":
          updateData.priority = change.newValue;
          results.push(`priority → ${change.newValue}`);
          break;
        case "title":
          updateData.title = change.newValue;
          results.push(`title updated`);
          break;
        case "assignee": {
          const convex = getConvexClient();
          const teamDocs = await convex.query(api.teamMembers.list, { activeOnly: true }) as any[];
          const match = teamDocs.find(
            (t: any) => (t.name as string).toLowerCase().includes(change.newValue.toLowerCase())
          );
          if (match) {
            await addAssignee(ticket.id, match._id as string, actor);
            results.push(`assigned ${match.name}`);
          }
          break;
        }
      }
    }

    // Apply non-assignee changes
    const { assignee: _, ...ticketUpdates } = updateData as Record<string, unknown> & { assignee?: unknown };
    if (Object.keys(ticketUpdates).length > 0) {
      await updateTicket(ticket.id, ticketUpdates as Parameters<typeof updateTicket>[1], actor);
    }

    const summary = results.join(", ");
    await replyInThread(channelId, replyTs, `Done — updated *${ticket.ticketNumber}*: ${summary}`);
    await addSlackReaction(channelId, replyTs, "white_check_mark");
  }
}
