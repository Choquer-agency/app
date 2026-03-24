import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasMinRole, type RoleLevel } from "@/lib/permissions";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // All team members can post announcements
  try {
    const { title, content, pinned } = await request.json();
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Default expiry: end of today
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const expiresAt = endOfDay.toISOString();

    const convex = getConvexClient();
    const newId = await convex.mutation(api.bulletin.createAnnouncement, {
      authorId: session.teamMemberId as any,
      title,
      content: content || "",
      pinned: pinned || false,
      source: "manual",
      announcementType: "general",
      expiresAt,
    });

    return NextResponse.json({
      id: newId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Create announcement error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create announcement" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasMinRole(session.roleLevel as RoleLevel, "c_suite")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    await convex.mutation(api.bulletin.deleteAnnouncement, { id: id as any });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete announcement" },
      { status: 500 }
    );
  }
}
