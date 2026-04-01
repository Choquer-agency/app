import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { updateComment, deleteComment, getComment } from "@/lib/ticket-comments";
import { hasPermission } from "@/lib/permissions";

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

    // Fetch the comment to check ownership
    const comment = await getComment(commentId);
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Owner can delete any comment; others can only delete their own
    const canDeleteAny = hasPermission(session.roleLevel, "comments:delete_any");
    const isOwnComment = comment.authorId === session.teamMemberId;

    if (!canDeleteAny && !isOwnComment) {
      return NextResponse.json(
        { error: "You can only delete your own comments" },
        { status: 403 }
      );
    }

    const deleted = await deleteComment(commentId, session.teamMemberId);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete comment:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
