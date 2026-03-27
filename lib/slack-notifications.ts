/**
 * Slack notifications for ticket events.
 * Sends DMs to team members when relevant ticket events occur.
 */

import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import { sendSlackDM } from "./slack";
import { CreateTicketInput } from "@/types";

/**
 * Notify assignees via Slack DM when a ticket is created and assigned to them.
 * Fire-and-forget — does not block ticket creation.
 */
export async function notifyAssigneesViaSlack(
  ticketId: string,
  ticketNumber: string,
  ticketData: CreateTicketInput,
  assigneeIds: string[]
): Promise<void> {
  try {
    const convex = getConvexClient();

    // Get assignee details
    const allMembers = await convex.query(api.teamMembers.list, {});
    const allClients = await convex.query(api.clients.list, {});

    const client = ticketData.clientId
      ? allClients.find((c: any) => c._id === ticketData.clientId)
      : null;

    for (const assigneeId of assigneeIds) {
      const member = allMembers.find((m: any) => m._id === assigneeId);
      if (!member || !member.slackUserId || !member.active) continue;

      const firstName = (member.name as string).split(" ")[0];

      // Build concise summary
      const parts: string[] = [];
      parts.push(`Hey ${firstName}, new ticket assigned to you:\n`);
      parts.push(`*${ticketNumber}* — ${ticketData.title}`);

      // Details line
      const details: string[] = [];
      if (client) details.push(`Client: ${client.name}`);
      if (ticketData.dueDate) details.push(`Due: ${ticketData.dueDate}`);
      if (ticketData.priority && ticketData.priority !== "normal") {
        details.push(`Priority: ${ticketData.priority}`);
      }
      if (details.length > 0) {
        parts.push(details.join(" | "));
      }

      // Brief description summary (first 150 chars)
      if (ticketData.description && ticketData.description.length > 0) {
        const desc = ticketData.description.replace(/<[^>]*>/g, "").trim();
        if (desc.length > 0) {
          const summary = desc.length > 150 ? desc.slice(0, 147) + "..." : desc;
          parts.push(`\n${summary}`);
        }
      }

      const message = parts.join("\n");

      await sendSlackDM(member.slackUserId as string, message);
    }
  } catch (err) {
    // Non-critical — log and continue
    console.error("[slack-notifications] Failed to notify assignees:", err);
  }
}
