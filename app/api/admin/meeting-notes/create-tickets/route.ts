import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { createTicket } from "@/lib/tickets";
import { addCommitment } from "@/lib/commitments";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

interface TicketToCreate {
  title: string;
  description: string;
  assigneeId: string | null;
  clientId: string | null;
  dueDate: string | null;
  priority: string;
}

/** If date falls on Saturday or Sunday, push to next Monday */
function adjustForWeekend(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { meetingNoteId, items } = (await request.json()) as {
      meetingNoteId?: string;
      items: TicketToCreate[];
    };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items to create" }, { status: 400 });
    }

    const actor = { id: session.teamMemberId, name: session.name || "System" };
    const created: Array<{ ticketId: string; ticketNumber: string; title: string }> = [];

    for (const item of items) {
      const ticket = await createTicket(
        {
          title: item.title,
          description: item.description || "",
          clientId: item.clientId ?? null,
          dueDate: item.dueDate ? adjustForWeekend(item.dueDate) : null,
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
          committedDate: adjustForWeekend(item.dueDate),
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
      const convex = getConvexClient();
      // Get existing extraction data and merge
      const note = await convex.query(api.meetingNotes.getById, { id: meetingNoteId as any });
      const existingExtraction = (note as any)?.rawExtraction || {};
      await convex.mutation(api.meetingNotes.update, {
        id: meetingNoteId as any,
        rawExtraction: { ...existingExtraction, createdTickets: created },
      });
    }

    return NextResponse.json({ created }, { status: 201 });
  } catch (error) {
    console.error("Failed to create tickets from meeting:", error);
    return NextResponse.json({ error: "Failed to create tickets" }, { status: 500 });
  }
}
