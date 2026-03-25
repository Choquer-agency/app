import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getAllTeamMembers } from "@/lib/team-members";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const members = await getAllTeamMembers();
    const me = members.find(
      (m) => m.id === session.teamMemberId || m.email?.toLowerCase() === session.email?.toLowerCase()
    );

    if (!me) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: me.id,
      name: me.name,
      email: me.email,
      vacationDaysTotal: (me as any).vacationDaysTotal ?? 10,
      vacationDaysUsed: (me as any).vacationDaysUsed ?? 0,
      sickDaysTotal: me.sickDaysTotal ?? 5,
      hourlyRate: me.hourlyRate,
      role: me.role,
    });
  } catch (error) {
    console.error("Failed to fetch team member info:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
