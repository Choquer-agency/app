import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";
import { createTicket } from "@/lib/tickets";
import { addCommitment } from "@/lib/commitments";

interface TicketToCreate {
  title: string;
  description: string;
  assigneeId: number | null;
  clientId: number | null;
  dueDate: string | null;
  priority: string;
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { meetingNoteId, items } = (await request.json()) as {
      meetingNoteId?: number;
      items: TicketToCreate[];
    };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items to create" }, { status: 400 });
    }

    const actor = { id: session.teamMemberId, name: session.name || "System" };
    const created: Array<{ ticketId: number; ticketNumber: string; title: string }> = [];

    for (const item of items) {
      const ticket = await createTicket(
        {
          title: item.title,
          description: item.description || "",
          clientId: item.clientId ?? null,
          dueDate: item.dueDate ?? null,
          priority: (item.priority as "low" | "normal" | "high" | "urgent") || "normal",
          assigneeIds: item.assigneeId ? [item.assigneeId] : [],
        },
        session.teamMemberId,
        actor
      );

      // Create commitment if there's a due date and an assignee
      if (item.dueDate && item.assigneeId) {
        await addCommitment({
          ticketId: ticket.id,
          teamMemberId: item.assigneeId,
          committedDate: item.dueDate,
          committedById: session.teamMemberId,
          notes: "Created from meeting notes",
        });
      }

      created.push({
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
      });
    }

    // Link tickets to meeting note if we have one
    if (meetingNoteId) {
      await sql`
        UPDATE meeting_notes
        SET raw_extraction = raw_extraction || ${JSON.stringify({ createdTickets: created })}::jsonb
        WHERE id = ${meetingNoteId}
      `;
    }

    return NextResponse.json({ created }, { status: 201 });
  } catch (error) {
    console.error("Failed to create tickets from meeting:", error);
    return NextResponse.json({ error: "Failed to create tickets" }, { status: 500 });
  }
}
