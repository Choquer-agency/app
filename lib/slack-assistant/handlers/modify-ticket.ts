/**
 * Modify ticket handler.
 * Updates an existing ticket by CHQ number.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext, ModifyTicketData } from "../types";
import { createConversation, updateConversation } from "../conversation";
import { replyInThread, addSlackReaction } from "@/lib/slack";
import { getTicketByNumber, updateTicket, addAssignee, removeAssignee, getTicketAssignees } from "@/lib/tickets";

export class ModifyTicketHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { conversation } = ctx;

    if (conversation) {
      await this.handleApproval(ctx);
    } else {
      await this.handleNew(ctx);
    }
  }

  private async handleNew(ctx: HandlerContext): Promise<void> {
    const { channelId, messageTs, user, classification } = ctx;
    const data = classification?.data as ModifyTicketData | undefined;

    if (!data?.ticketNumber) {
      await replyInThread(channelId, messageTs, "I couldn't find a ticket number in your message. Please include a CHQ number (e.g., CHQ-045).");
      return;
    }

    const ticket = await getTicketByNumber(data.ticketNumber);
    if (!ticket) {
      await replyInThread(channelId, messageTs, `I couldn't find ticket *${data.ticketNumber}*. Double-check the number?`);
      return;
    }

    // Non-owner users can only modify tickets assigned to them
    if (!user.isOwner) {
      const convex = getConvexClient();
      const assignees = await convex.query(api.ticketAssignees.listByTicket, { ticketId: ticket.id as any });
      const isAssigned = (assignees as any[]).some((a: any) => a.teamMemberId === user.id);
      if (!isAssigned) {
        await replyInThread(channelId, messageTs, `You can only modify tickets assigned to you. *${data.ticketNumber}* isn't assigned to you.`);
        return;
      }

      // Restrict which fields non-owners can change
      const allowedFields = ["status", "due_date"];
      const restricted = data.changes?.filter((c) => !allowedFields.includes(c.field));
      if (restricted && restricted.length > 0) {
        await replyInThread(channelId, messageTs, `You can change the status or due date of your tickets. For other changes, ask your team lead.`);
        return;
      }
    }

    const changes = data.changes || [];
    if (changes.length === 0) {
      await replyInThread(channelId, messageTs, `Found *${ticket.ticketNumber}*: ${ticket.title}\n\nWhat would you like to change? (${user.isOwner ? "due date, status, priority, assignee, title" : "status, due date"})`);
      return;
    }

    // Build a human-readable summary of changes
    const changeDescriptions = changes.map((c) => {
      const field = c.field.replace(/_/g, " ");
      return `• ${field} → *${c.newValue}*`;
    });

    await createConversation({
      threadTs: messageTs,
      channelId,
      intent: "modify_ticket",
      state: "awaiting_approval",
      data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title, changes },
      userId: user.id,
    });

    await replyInThread(
      channelId,
      messageTs,
      `I'll update *${ticket.ticketNumber}* (${ticket.title}):\n\n${changeDescriptions.join("\n")}\n\nReply *approve* to confirm.`
    );
  }

  private async handleApproval(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, conversation, user } = ctx;
    if (!conversation) return;

    const text = messageText.toLowerCase().trim();
    if (!["approve", "approved", "yes", "looks good", "lgtm", "do it", "go ahead"].includes(text)) {
      await replyInThread(channelId, conversation.threadTs, "Reply *approve* to confirm the changes, or tell me different changes.");
      return;
    }

    const { ticketId, ticketNumber, changes } = conversation.data as {
      ticketId: string;
      ticketNumber: string;
      title: string;
      changes: Array<{ field: string; newValue: string }>;
    };

    const actor = { id: user.id as any, name: "Slack Assistant" };
    const updateData: Record<string, unknown> = {};

    for (const change of changes) {
      switch (change.field) {
        case "due_date":
          updateData.dueDate = change.newValue;
          break;
        case "status":
          updateData.status = change.newValue;
          break;
        case "priority":
          updateData.priority = change.newValue;
          break;
        case "title":
          updateData.title = change.newValue;
          break;
        case "assignee": {
          // Resolve assignee name to ID and add
          const convex = getConvexClient();
          const teamDocs = await convex.query(api.teamMembers.list, { activeOnly: true }) as any[];
          const match = teamDocs.find(
            (t: any) => (t.name as string).toLowerCase().includes(change.newValue.toLowerCase())
          );
          if (match) {
            const newAssigneeId = match._id as string;
            await addAssignee(ticketId, newAssigneeId, actor);
          }
          break;
        }
      }
    }

    // Apply non-assignee changes
    const { assignee: _, ...ticketUpdates } = updateData as Record<string, unknown> & { assignee?: unknown };
    if (Object.keys(ticketUpdates).length > 0) {
      await updateTicket(ticketId, ticketUpdates as Parameters<typeof updateTicket>[1], actor);
    }

    await updateConversation(conversation.threadTs, { state: "done" });
    await replyInThread(channelId, conversation.threadTs, `Updated *${ticketNumber}*`);
    await addSlackReaction(channelId, conversation.threadTs, "white_check_mark");
  }
}
