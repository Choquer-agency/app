import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { getTicketById } from "@/lib/tickets";
import { getComments } from "@/lib/ticket-comments";
import { getAttachments } from "@/lib/ticket-attachments";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; ticketId: string }> }
) {
  try {
    const { slug, ticketId } = await params;
    const client = await getClientBySlug(slug);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const ticket = await getTicketById(Number(ticketId));
    if (!ticket || ticket.clientId !== client.id) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const [comments, attachments] = await Promise.all([
      getComments(ticket.id),
      getAttachments(ticket.id),
    ]);

    return NextResponse.json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      descriptionFormat: ticket.descriptionFormat,
      status: ticket.status,
      priority: ticket.priority,
      dueDate: ticket.dueDate,
      createdAt: ticket.createdAt,
      assignees: (ticket.assignees || []).map((a) => ({
        memberName: a.memberName,
        memberColor: a.memberColor,
        memberProfilePicUrl: a.memberProfilePicUrl,
      })),
      comments: comments.map((c) => ({
        id: c.id,
        authorType: c.authorType,
        authorName: c.authorName,
        content: c.content,
        createdAt: c.createdAt,
      })),
      attachments: attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileSize: a.fileSize,
        fileType: a.fileType,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    console.error("[client-ticket-detail] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch ticket" }, { status: 500 });
  }
}
