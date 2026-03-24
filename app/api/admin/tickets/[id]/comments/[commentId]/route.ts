import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { updateComment, deleteComment } from "@/lib/ticket-comments";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { commentId } = await params;
    const { content } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const updated = await updateComment(
      Number(commentId),
      content,
      session.teamMemberId
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Comment not found or not authorized" },
        { status: 403 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update comment:", error);
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { commentId } = await params;
    const deleted = await deleteComment(Number(commentId), session.teamMemberId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Comment not found or not authorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete comment:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
