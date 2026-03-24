import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getTicketById, updateTicket, archiveTicket } from "@/lib/tickets";
import { notifyMention } from "@/lib/notification-triggers";

// Extract @mention IDs from tiptap JSON content
function extractMentionIds(description: string): number[] {
  try {
    const doc = JSON.parse(description);
    const ids: number[] = [];
    function walk(node: Record<string, unknown>) {
      if (node.type === "mention" && node.attrs) {
        const id = (node.attrs as Record<string, unknown>).id;
        if (typeof id === "number") ids.push(id);
        else if (typeof id === "string" && !isNaN(Number(id))) ids.push(Number(id));
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) walk(child as Record<string, unknown>);
      }
    }
    walk(doc);
    return ids;
  } catch {
    return [];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const ticket = await getTicketById(Number(id));
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return NextResponse.json(ticket);
  } catch (error) {
    console.error("Failed to fetch ticket:", error);
    return NextResponse.json({ error: "Failed to fetch ticket" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const actor = { id: session.teamMemberId, name: session.name };

    // Capture old mentions before update
    let oldMentionIds: number[] = [];
    if (body.description) {
      const oldTicket = await getTicketById(Number(id));
      if (oldTicket) oldMentionIds = extractMentionIds(oldTicket.description || "");
    }

    const ticket = await updateTicket(Number(id), body, actor);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Notify only newly mentioned team members
    if (body.description) {
      const newMentionIds = extractMentionIds(body.description);
      const freshMentions = newMentionIds.filter((mid) => !oldMentionIds.includes(mid));
      if (freshMentions.length > 0) {
        notifyMention(Number(id), freshMentions, session.teamMemberId, session.name).catch(() => {});
      }
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error("Failed to update ticket:", error);
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const actor = { id: session.teamMemberId, name: session.name };
    const success = await archiveTicket(Number(id), actor);
    if (!success) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to archive ticket:", error);
    return NextResponse.json({ error: "Failed to archive ticket" }, { status: 500 });
  }
}
