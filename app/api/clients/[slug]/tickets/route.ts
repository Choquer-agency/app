import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/lib/clients";
import { getTickets } from "@/lib/tickets";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const client = await getClientBySlug(slug);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const tickets = await getTickets({
      clientId: client.id,
      archived: false,
      isPersonal: false,
      limit: 200,
    });

    // Return limited fields for client view
    const clientTickets = tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
      assignees: (t.assignees || []).map((a) => ({
        memberName: a.memberName,
        memberColor: a.memberColor,
        memberProfilePicUrl: a.memberProfilePicUrl,
      })),
    }));

    return NextResponse.json(clientTickets);
  } catch (err) {
    console.error("[client-tickets] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}
