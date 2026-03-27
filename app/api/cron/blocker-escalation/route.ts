import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { sendSlackDM } from "@/lib/slack";

/**
 * Blocker Escalation Cron
 * Runs 3x daily on weekdays. Checks for unacknowledged blockers older than 4 hours
 * and escalates to the owner via Slack DM.
 */

const ESCALATION_THRESHOLD_HOURS = 4;

export async function GET() {
  try {
    const convex = getConvexClient();

    // Get all unacknowledged blockers
    const unacknowledged = await convex.query(api.blockerEscalations.listUnacknowledged);

    if (unacknowledged.length === 0) {
      return NextResponse.json({ success: true, escalated: 0, reason: "No unacknowledged blockers" });
    }

    // Find the owner for escalation
    const allMembers = await convex.query(api.teamMembers.list, {});
    const owner = allMembers.find((m: any) => m.roleLevel === "owner" && m.active && m.slackUserId);

    if (!owner) {
      return NextResponse.json({ success: true, escalated: 0, reason: "No owner with Slack configured" });
    }

    const now = Date.now();
    const thresholdMs = ESCALATION_THRESHOLD_HOURS * 60 * 60 * 1000;
    let escalatedCount = 0;
    const escalationMessages: string[] = [];

    for (const blocker of unacknowledged) {
      // Check if old enough to escalate
      const createdAt = (blocker as any)._creationTime;
      if (!createdAt || now - createdAt < thresholdMs) continue;

      // Skip if already escalated
      if ((blocker as any).escalatedToOwner) continue;

      // Get ticket info
      const ticket = await convex.query(api.tickets.getById, { id: (blocker as any).ticketId });
      if (!ticket) continue;

      // Get reporter name
      const reporter = allMembers.find((m: any) => m._id === (blocker as any).reportedById);
      const reporterName = reporter ? (reporter.name as string).split(" ")[0] : "A team member";

      // Get blocker name
      const blockedBy = (blocker as any).blockedById
        ? allMembers.find((m: any) => m._id === (blocker as any).blockedById)
        : null;
      const blockedByName = blockedBy ? (blockedBy.name as string).split(" ")[0] : "someone";

      const hoursAgo = Math.round((now - createdAt) / (60 * 60 * 1000));

      escalationMessages.push(
        `• *${(ticket as any).ticketNumber}*: ${(ticket as any).title}\n  ${reporterName} waiting on ${blockedByName} — ${hoursAgo}h, no response`
      );

      // Mark as escalated
      await convex.mutation(api.blockerEscalations.markEscalated, {
        id: (blocker as any)._id,
      });
      escalatedCount++;
    }

    // Send digest to owner if there are escalations
    if (escalationMessages.length > 0) {
      const message = `Blocker alert — ${escalationMessages.length} unresolved:\n\n${escalationMessages.join("\n\n")}`;
      await sendSlackDM(owner.slackUserId as string, message);
    }

    return NextResponse.json({
      success: true,
      escalated: escalatedCount,
      total: unacknowledged.length,
    });
  } catch (error) {
    console.error("[blocker-escalation cron] Error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
