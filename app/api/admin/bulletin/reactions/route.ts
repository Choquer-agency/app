import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

// Toggle a reaction (add if not exists, remove if exists)
export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { announcementId, emoji } = await request.json();
    if (!announcementId || !emoji) {
      return NextResponse.json({ error: "announcementId and emoji are required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const action = await convex.mutation(api.bulletin.toggleReaction, {
      announcementId: announcementId as any,
      teamMemberId: session.teamMemberId as any,
      emoji,
    });

    return NextResponse.json({ action });
  } catch (error) {
    console.error("Reaction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to toggle reaction" },
      { status: 500 }
    );
  }
}
