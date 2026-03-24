import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getSession } from "@/lib/admin-auth";
import { extractActionItems, ExtractedItem, toLegacyItems, LegacyExtractedItem } from "@/lib/meeting-extraction";
import { getTeamMembers } from "@/lib/team-members";
import { getAllClients } from "@/lib/clients";

export interface ExtractedItemWithMatches extends LegacyExtractedItem {
  resolvedAssigneeId: number | null;
  resolvedClientId: number | null;
  duplicates: Array<{
    ticketId: number;
    ticketNumber: string;
    title: string;
    status: string;
  }>;
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { meetingNoteId, transcript, teamMemberId } = await request.json();

    // Get the transcript either from the DB or from the request
    let transcriptText = transcript;
    if (meetingNoteId && !transcriptText) {
      const { rows } = await sql`SELECT transcript FROM meeting_notes WHERE id = ${meetingNoteId}`;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Meeting note not found" }, { status: 404 });
      }
      transcriptText = rows[0].transcript as string;
    }

    if (!transcriptText?.trim()) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    }

    // Get team members and clients for name matching
    const teamMembers = await getTeamMembers();
    const clients = await getAllClients();

    const teamMemberNames = teamMembers.map((m) => m.name);
    const clientNames = clients.map((c) => c.name);

    // Find the meeting-with member name
    const meetingWith = teamMembers.find((m) => m.id === teamMemberId)?.name || "team member";

    // Extract action items via Claude (web UI mode — transcript, no expansion)
    const { items: rawItems, summary } = await extractActionItems(
      transcriptText,
      teamMemberNames,
      clientNames,
      meetingWith,
      { inputType: "transcript", expansionLevel: "none", source: "web" }
    );

    // Convert to legacy format for backward compat with frontend
    const items = toLegacyItems(rawItems);

    // Resolve names to IDs and find duplicates
    const enrichedItems: ExtractedItemWithMatches[] = await Promise.all(
      items.map(async (item) => {
        // Resolve assignee
        const assignee = teamMembers.find(
          (m) => m.name.toLowerCase() === item.assigneeName.toLowerCase()
        );

        // Resolve client
        const client = clients.find(
          (c) => c.name.toLowerCase() === item.clientName.toLowerCase()
        );

        // Find duplicate/similar open tickets — strict matching only
        // Only flag as duplicate if the title is very close (most words match)
        const duplicates: ExtractedItemWithMatches["duplicates"] = [];
        if (client) {
          // Use the full task title for a tight ILIKE match
          const taskWords = item.task
            .replace(/[^a-zA-Z0-9\s]/g, "")
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3);

          // Need at least 2 significant words to even attempt matching
          if (taskWords.length >= 2) {
            // Search by client + tight title match (require 2+ keywords to match)
            const { rows: candidates } = await sql`
              SELECT t.id AS ticket_id, t.ticket_number, t.title, t.status, t.due_date
              FROM tickets t
              WHERE t.client_id = ${client.id}
                AND t.status NOT IN ('closed', 'approved_go_live')
                AND t.archived = false
              LIMIT 50
            `;

            for (const row of candidates) {
              const existingTitle = (row.title as string).toLowerCase();
              const matchingWords = taskWords.filter((w) => existingTitle.includes(w));
              // Only flag if majority of significant words match
              if (matchingWords.length >= Math.ceil(taskWords.length * 0.6) && matchingWords.length >= 2) {
                duplicates.push({
                  ticketId: row.ticket_id as number,
                  ticketNumber: row.ticket_number as string,
                  title: row.title as string,
                  status: row.status as string,
                });
              }
            }
          }
        }

        return {
          ...item,
          resolvedAssigneeId: assignee?.id ?? null,
          resolvedClientId: client?.id ?? null,
          duplicates,
        };
      })
    );

    // Update meeting note with extraction results if we have an ID
    if (meetingNoteId) {
      await sql`
        UPDATE meeting_notes
        SET summary = ${summary}, raw_extraction = ${JSON.stringify(enrichedItems)}::jsonb
        WHERE id = ${meetingNoteId}
      `;
    }

    return NextResponse.json({
      summary,
      items: enrichedItems,
      meetingNoteId,
    });
  } catch (error) {
    console.error("Failed to extract action items:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
