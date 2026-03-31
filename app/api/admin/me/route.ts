import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch member details from Convex
  let tags: string[] = [];
  let bypassClockIn = false;
  try {
    const convex = getConvexClient();
    const member = await convex.query(api.teamMembers.getById, { id: session.teamMemberId as any });
    if (member) {
      if (Array.isArray((member as any).tags)) {
        tags = (member as any).tags as string[];
      }
      if ((member as any).bypassClockIn) {
        bypassClockIn = true;
      }
    }
  } catch {
    // fields may not exist yet
  }

  return NextResponse.json({
    teamMemberId: session.teamMemberId,
    name: session.name,
    email: session.email,
    roleLevel: session.roleLevel,
    tags,
    bypassClockIn,
  });
}
