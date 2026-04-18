import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";

// GET: List past briefings for a member
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberId = request.nextUrl.searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  const convex = getConvexClient();
  const briefings = await convex.query(api.meetingBriefings.listByMember, {
    teamMemberId: memberId as any,
    limit: 20,
  });

  return NextResponse.json(briefings);
}

// DELETE: Remove a briefing
export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const convex = getConvexClient();
    await convex.mutation(api.meetingBriefings.remove, { id: id as any });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete briefing:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
