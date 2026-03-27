import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { sendSlackDM, logSlackMessage } from "@/lib/slack";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface DueItem {
  ticket_id: string;
  ticket_number: string;
  title: string;
  client_name: string | null;
  source: "commitment" | "due_date";
  is_commitment_due: boolean;
}

export async function GET() {
  try {
    const convex = getConvexClient();

    // Get active team members with Slack configured
    const allMembers = await convex.query(api.teamMembers.list, {});
    const members = allMembers.filter(
      (m: any) => m.active && m.slackUserId
    );

    if (members.length === 0) {
      return NextResponse.json({ success: true, sent: 0, reason: "No members with Slack configured" });
    }

    const allTickets = await convex.query(api.tickets.list, {});
    const allClients = await convex.query(api.clients.list, {});
    const todayStr = new Date().toISOString().split("T")[0];

    let sentCount = 0;

    for (const member of members) {
      const memberId = member._id;
      const memberName = (member.name as string).split(" ")[0]; // First name
      const slackId = member.slackUserId as string;

      // Get tickets assigned to this member
      const assignments = await convex.query(api.ticketAssignees.listByMember, {
        teamMemberId: memberId as any,
      });

      const allItems: DueItem[] = [];
      const seen = new Set<string>();

      // Check commitments due today
      for (const assignment of assignments) {
        const commitments = await convex.query(api.commitments.listByTicket, {
          ticketId: assignment.ticketId as any,
        });

        for (const c of commitments) {
          if ((c as any).teamMemberId !== memberId) continue;
          if (c.status !== "active") continue;
          if ((c as any).committedDate !== todayStr) continue;

          const ticket = allTickets.find((t: any) => t._id === assignment.ticketId);
          if (!ticket) continue;
          if (["closed", "approved_go_live"].includes(ticket.status)) continue;
          if (ticket.archived) continue;

          if (!seen.has(ticket._id)) {
            seen.add(ticket._id);
            const client = ticket.clientId ? allClients.find((cl: any) => cl._id === ticket.clientId) : null;
            allItems.push({
              ticket_id: ticket._id,
              ticket_number: ticket.ticketNumber,
              title: ticket.title,
              client_name: client ? client.name : null,
              source: "commitment",
              is_commitment_due: true,
            });
          }
        }
      }

      // Check tickets due today
      for (const assignment of assignments) {
        const ticket = allTickets.find((t: any) => t._id === assignment.ticketId);
        if (!ticket) continue;
        if (ticket.dueDate !== todayStr) continue;
        if (["closed", "approved_go_live"].includes(ticket.status)) continue;
        if (ticket.archived) continue;

        if (!seen.has(ticket._id)) {
          seen.add(ticket._id);
          const client = ticket.clientId ? allClients.find((cl: any) => cl._id === ticket.clientId) : null;
          allItems.push({
            ticket_id: ticket._id,
            ticket_number: ticket.ticketNumber,
            title: ticket.title,
            client_name: client ? client.name : null,
            source: "due_date",
            is_commitment_due: false,
          });
        }
      }

      // Skip if nothing to report
      if (allItems.length === 0) continue;

      // Group by client
      const byClient = new Map<string, DueItem[]>();
      for (const item of allItems) {
        const key = item.client_name || "Internal";
        if (!byClient.has(key)) byClient.set(key, []);
        byClient.get(key)!.push(item);
      }

      // Compose message
      const dayName = DAYS[new Date().getDay()];
      const lines: string[] = [];
      lines.push(`Hey ${memberName}, quick EOD check-in for ${dayName}:\n`);

      for (const [client, items] of byClient) {
        lines.push(`*${client}*`);
        for (const item of items) {
          const commitmentFlag = item.is_commitment_due ? " (you committed to finishing today)" : "";
          lines.push(`• ${item.ticket_number}: ${item.title}${commitmentFlag}`);
        }
        lines.push("");
      }

      lines.push("How are things looking? Reply here and I'll help update tickets, flag blockers, or draft client emails.");

      const message = lines.join("\n");

      // Send via Slack
      const result = await sendSlackDM(slackId, message);
      if (result.ok) {
        // Store with ticket data so EOD replies can reference the original tickets
        const ticketData = allItems.map((item) => ({
          ticketId: item.ticket_id,
          ticketNumber: item.ticket_number,
          title: item.title,
          clientName: item.client_name,
          isCommitmentDue: item.is_commitment_due,
        }));

        await logSlackMessage(
          memberId as any,
          "eod_checkin",
          message,
          result.ts,
          result.channel,
          { tickets: ticketData }
        );
        sentCount++;
      } else {
        console.error(`[eod-checkin] Failed to send to ${memberName}:`, result.error);
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      totalMembers: members.length,
    });
  } catch (error) {
    console.error("[eod-checkin cron] Error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
