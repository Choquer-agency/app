import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { extractActionItems, toLegacyItems, LegacyExtractedItem, InteractionType } from "@/lib/meeting-extraction";
import { getTeamMembers } from "@/lib/team-members";
import { getAllClients } from "@/lib/clients";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export interface ExtractedItemWithMatches extends LegacyExtractedItem {
  resolvedAssigneeId: string | null;
  resolvedClientId: string | null;
  duplicates: Array<{
    ticketId: string;
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
    const { meetingNoteId, transcript, teamMemberId, interactionType, clientId } = await request.json();
    const iType: InteractionType = interactionType || "team_meeting";
    const convex = getConvexClient();

    // Get the transcript either from Convex or from the request
    let transcriptText = transcript;
    if (meetingNoteId && !transcriptText) {
      const note = await convex.query(api.meetingNotes.getById, { id: meetingNoteId as any });
      if (!note) {
        return NextResponse.json({ error: "Meeting note not found" }, { status: 404 });
      }
      transcriptText = (note as any).transcript as string;
    }

    if (!transcriptText?.trim()) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    }

    // Get team members and clients for name matching
    const teamMembers = await getTeamMembers();
    const clients = await getAllClients();

    const teamMemberNames = teamMembers.map((m) => m.name);
    const clientNames = clients.map((c) => c.name);

    // Find the meeting-with context name based on interaction type
    const isClientType = ["client_meeting", "client_email", "client_phone_call"].includes(iType);
    let meetingWith: string;
    if (isClientType && clientId) {
      meetingWith = clients.find((c) => String(c.id) === String(clientId))?.name || "a client";
    } else if (iType === "general_notes") {
      meetingWith = "internal team notes";
    } else {
      meetingWith = teamMembers.find((m) => m.id === teamMemberId)?.name || "team member";
    }

    // Extract action items via Claude (web UI mode — transcript, no expansion)
    const { items: rawItems, summary } = await extractActionItems(
      transcriptText,
      teamMemberNames,
      clientNames,
      meetingWith,
      { inputType: "transcript", expansionLevel: "none", source: "web", interactionType: iType }
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
        const duplicates: ExtractedItemWithMatches["duplicates"] = [];
        if (client) {
          const taskWords = item.task
            .replace(/[^a-zA-Z0-9\s]/g, "")
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3);

          if (taskWords.length >= 2) {
            // Fetch open tickets for this client
            const candidates = await convex.query(api.tickets.list, {
              clientId: client.id as any,
              archived: false,
              limit: 50,
            });

            for (const row of candidates as any[]) {
              if (row.status === "closed" || row.status === "approved_go_live") continue;
              const existingTitle = (row.title as string).toLowerCase();
              const matchingWords = taskWords.filter((w) => existingTitle.includes(w));
              if (matchingWords.length >= Math.ceil(taskWords.length * 0.6) && matchingWords.length >= 2) {
                duplicates.push({
                  ticketId: row._id,
                  ticketNumber: row.ticketNumber,
                  title: row.title,
                  status: row.status,
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
      await convex.mutation(api.meetingNotes.update, {
        id: meetingNoteId as any,
        summary,
        rawExtraction: enrichedItems,
      });
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
