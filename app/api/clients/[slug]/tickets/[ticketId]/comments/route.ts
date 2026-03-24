import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { getTicketById } from "@/lib/tickets";
import { getComments, addComment } from "@/lib/ticket-comments";

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

    const comments = await getComments(ticket.id);
    return NextResponse.json(
      comments.map((c) => ({
        id: c.id,
        authorType: c.authorType,
        authorName: c.authorName,
        content: c.content,
        createdAt: c.createdAt,
      }))
    );
  } catch (err) {
    console.error("[client-ticket-comments] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
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

    // Only allow comments when ticket is in client_review status
    if (ticket.status !== "client_review") {
      return NextResponse.json(
        { error: "Comments are only allowed when the ticket is in Client Review status" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { authorName, authorEmail, content } = body;

    if (!authorName?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "Name and comment content are required" },
        { status: 400 }
      );
    }

    const comment = await addComment(
      ticket.id,
      null, // no team member ID for client comments
      authorName.trim(),
      authorEmail?.trim() || "",
      content.trim(),
      "client"
    );

    return NextResponse.json(
      {
        id: comment.id,
        authorType: comment.authorType,
        authorName: comment.authorName,
        content: comment.content,
        createdAt: comment.createdAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[client-ticket-comments] POST error:", err);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
