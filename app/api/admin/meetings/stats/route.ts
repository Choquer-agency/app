import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET() {
  try {
    const convex = getConvexClient();

    // Get all active team members
    const allMembers = await convex.query(api.teamMembers.list, {});
    const activeMembers = (allMembers as any[]).filter((m: any) => m.active);

    // Get all non-archived tickets with assignees
    const allTickets = await convex.query(api.tickets.list, { archived: false });
    const today = new Date().toISOString().split("T")[0];

    // Build stats per team member
    const rows = await Promise.all(
      activeMembers.map(async (member: any) => {
        // Get assignees for counting
        const memberTickets = (allTickets as any[]).filter((t: any) => {
          // Check if this member is an assignee
          if (t.assigneeIds && Array.isArray(t.assigneeIds)) {
            return t.assigneeIds.includes(member._id);
          }
          return false;
        });

        const openTickets = memberTickets.filter((t: any) => t.status !== "closed").length;
        const overdueTickets = memberTickets.filter(
          (t: any) => t.status !== "closed" && t.dueDate && t.dueDate < today
        ).length;

        return {
          id: member._id,
          openTickets,
          overdueTickets,
        };
      })
    );

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Meeting stats error:", error);
    return NextResponse.json([], { status: 200 });
  }
}
