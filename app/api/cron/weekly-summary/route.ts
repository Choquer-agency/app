import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { autoResolveMissedCommitments, autoResolveMetCommitments } from "@/lib/commitments";
import { sendSlackDM, logSlackMessage } from "@/lib/slack";

export async function GET() {
  try {
    const convex = getConvexClient();

    // 1. Auto-resolve: mark missed and met commitments first
    const missed = await autoResolveMissedCommitments();
    const met = await autoResolveMetCommitments();

    // 2. Get all active team members
    const allMembers = await convex.query(api.teamMembers.list);
    const members = allMembers
      .filter((m: any) => m.active)
      .sort((a: any, b: any) => {
        const aIsOwner = (a.email || "").toLowerCase() === "bryce@choquer.agency" ? 0 : 1;
        const bIsOwner = (b.email || "").toLowerCase() === "bryce@choquer.agency" ? 0 : 1;
        if (aIsOwner !== bIsOwner) return aIsOwner - bIsOwner;
        return (a.name || "").localeCompare(b.name || "");
      });

    // 3. For each member, calculate last week's commitment stats
    const memberSummaries: Array<{
      name: string;
      total: number;
      metCount: number;
      missedCount: number;
      activeCount: number;
      reliability: number;
      missedItems: Array<{ ticketNumber: string; title: string }>;
    }> = [];

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const member of members) {
      const memberId = member._id;
      const memberName = member.name as string;

      // Get commitments for this member via tickets they're assigned to
      const assignedTickets = await convex.query(api.ticketAssignees.listByMember, {
        teamMemberId: memberId as any,
      });

      const resolved: Array<{ status: string; ticketNumber: string; title: string }> = [];
      let activeCount = 0;

      for (const assignment of assignedTickets) {
        const commitments = await convex.query(api.commitments.listByTicket, {
          ticketId: assignment.ticketId as any,
        });

        for (const c of commitments) {
          if ((c as any).teamMemberId !== memberId) continue;

          if (c.status === "active") {
            activeCount++;
          } else if (c.resolvedAt && c.resolvedAt > sevenDaysAgo) {
            // Get ticket details
            const tickets = await convex.query(api.tickets.list);
            const ticket = tickets.find((t: any) => t._id === assignment.ticketId);
            resolved.push({
              status: c.status,
              ticketNumber: ticket?.ticketNumber || "",
              title: ticket?.title || "",
            });
          }
        }
      }

      const metCount = resolved.filter((r) => r.status === "met").length;
      const missedCount = resolved.filter((r) => r.status === "missed").length;
      const total = metCount + missedCount;
      const reliability = total > 0 ? Math.round((metCount / total) * 100) : -1;

      const missedItems = resolved
        .filter((r) => r.status === "missed")
        .map((r) => ({
          ticketNumber: r.ticketNumber,
          title: r.title,
        }));

      if (total > 0 || activeCount > 0) {
        memberSummaries.push({
          name: memberName,
          total,
          metCount,
          missedCount,
          activeCount,
          reliability,
          missedItems,
        });
      }
    }

    // 4. Compose summary message for the owner
    if (memberSummaries.length === 0) {
      return NextResponse.json({
        success: true,
        sent: false,
        reason: "No commitments to summarize",
        resolved: { missed, met },
      });
    }

    const lines: string[] = [];
    lines.push("*Weekly recap before Monday meetings:*\n");

    for (const s of memberSummaries) {
      const reliabilityStr =
        s.reliability >= 0 ? `(${s.reliability}%)` : "";
      const emoji =
        s.reliability === 100
          ? " :fire:"
          : s.reliability >= 80
          ? ""
          : s.reliability >= 0
          ? " :warning:"
          : "";

      lines.push(
        `*${s.name}* — ${s.total} commitment${s.total !== 1 ? "s" : ""}, ${s.metCount} met, ${s.missedCount} missed ${reliabilityStr}${emoji}`
      );

      if (s.missedItems.length > 0) {
        for (const item of s.missedItems) {
          lines.push(`  :x: ${item.ticketNumber}: ${item.title}`);
        }
      }

      if (s.activeCount > 0) {
        lines.push(`  _${s.activeCount} still active_`);
      }

      lines.push("");
    }

    const message = lines.join("\n");

    // 5. Send to owner (Bryce)
    const owners = allMembers.filter(
      (m: any) => m.roleLevel === "owner" && m.active && m.slackUserId
    );

    let sent = false;
    if (owners.length > 0) {
      const owner = owners[0];
      const ownerId = owner._id;
      const ownerSlackId = owner.slackUserId as string;

      const result = await sendSlackDM(ownerSlackId, message);
      if (result.ok) {
        await logSlackMessage(ownerId as any, "weekly_summary", message, result.ts);
        sent = true;
      } else {
        console.error("[weekly-summary] Failed to send to owner:", result.error);
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      summaries: memberSummaries.length,
      resolved: { missed, met },
    });
  } catch (error) {
    console.error("[weekly-summary cron] Error:", error);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
