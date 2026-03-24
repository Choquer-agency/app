import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function PUT(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { content } = await request.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    }

    const convex = getConvexClient();
    await convex.mutation(api.bulletin.upsertPersonalNote, {
      teamMemberId: session.teamMemberId as any,
      content,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save personal note error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save note" },
      { status: 500 }
    );
  }
}
