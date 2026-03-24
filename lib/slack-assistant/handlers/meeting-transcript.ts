/**
 * Meeting transcript handler.
 * Extracts action items from pasted transcripts, shows them for review,
 * then creates tickets on approval.
 */

import { sql } from "@vercel/postgres";
import { IntentHandler, HandlerContext } from "../types";
import { createConversation, updateConversation } from "../conversation";
import { replyInThread, addSlackReaction } from "@/lib/slack";
import { extractActionItems, ExtractedItem } from "@/lib/meeting-extraction";
import { createTicket } from "@/lib/tickets";
import { addCommitment } from "@/lib/commitments";

interface TranscriptConversationData {
  items: Array<ExtractedItem & { assigneeId: number | null; clientId: number | null }>;
  summary: string;
  meetingNoteId: number | null;
}

export class MeetingTranscriptHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { conversation } = ctx;

    if (conversation) {
      // Continuation — handle approval, edits, or rejection
      await this.handleContinuation(ctx);
    } else {
      // New transcript — extract and present for review
      await this.handleNew(ctx);
    }
  }

  private async handleNew(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, messageTs, owner } = ctx;

    // Get team member and client names for extraction
    const [teamResult, clientResult] = await Promise.all([
      sql`SELECT id, name FROM team_members WHERE active = true`,
      sql`SELECT id, name FROM clients WHERE active = true`,
    ]);
    const teamMembers = teamResult.rows as Array<{ id: number; name: string }>;
    const clients = clientResult.rows as Array<{ id: number; name: string }>;

    const teamMemberNames = teamMembers.map((t) => t.name);
    const clientNames = clients.map((c) => c.name);

    // Save the transcript as a meeting note
    const { rows: noteRows } = await sql`
      INSERT INTO meeting_notes (team_member_id, created_by_id, transcript, source, meeting_date)
      VALUES (${owner.id}, ${owner.id}, ${messageText}, 'slack', ${new Date().toISOString().split("T")[0]})
      RETURNING id
    `;
    const meetingNoteId = noteRows[0]?.id as number | null;

    // Extract action items using existing Claude extraction
    let extraction: { items: ExtractedItem[]; summary: string };
    try {
      extraction = await extractActionItems(messageText, teamMemberNames, clientNames, "team");
    } catch (err) {
      console.error("Meeting extraction failed:", err);
      await replyInThread(channelId, messageTs, "I had trouble extracting action items from that transcript. Could you try pasting it again?");
      return;
    }

    if (extraction.items.length === 0) {
      await replyInThread(channelId, messageTs, "I didn't find any action items in that transcript. If you meant this as something else, let me know!");
      await addSlackReaction(channelId, messageTs, "eyes");
      return;
    }

    // Resolve names to IDs
    const resolvedItems = extraction.items.map((item) => {
      const assigneeMatch = teamMembers.find(
        (t) => t.name.toLowerCase() === item.assigneeName.toLowerCase()
      );
      const clientMatch = clients.find(
        (c) => c.name.toLowerCase() === item.clientName.toLowerCase()
      );
      return {
        ...item,
        assigneeId: assigneeMatch?.id ?? null,
        clientId: clientMatch?.id ?? null,
      };
    });

    // Create conversation state
    const conversationData: TranscriptConversationData = {
      items: resolvedItems,
      summary: extraction.summary,
      meetingNoteId,
    };

    await createConversation({
      threadTs: messageTs,
      channelId,
      intent: "meeting_transcript",
      state: "awaiting_review",
      data: conversationData as unknown as Record<string, unknown>,
      ownerId: owner.id,
    });

    // Format and send for review
    const itemsList = resolvedItems
      .map((item, i) => {
        const assignee = item.assigneeName || "Unassigned";
        const client = item.clientName || "Internal";
        const due = item.dueDate || "No due date";
        const priority = item.priority !== "normal" ? ` [${item.priority}]` : "";
        return `${i + 1}. *${item.task}*${priority}\n   ${assignee} | ${client} | ${due}`;
      })
      .join("\n");

    const message = `I extracted *${resolvedItems.length} action item${resolvedItems.length !== 1 ? "s" : ""}* from the transcript:\n\n${itemsList}\n\n_${extraction.summary}_\n\nReply *approve* to create these tickets, or tell me what to change (e.g., "remove 3", "change 2's due date to Friday", "change 1's assignee to John").`;

    await replyInThread(channelId, messageTs, message);
    await addSlackReaction(channelId, messageTs, "memo");
  }

  private async handleContinuation(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, conversation, owner } = ctx;
    if (!conversation) return;

    const data = conversation.data as unknown as TranscriptConversationData;
    const text = messageText.toLowerCase().trim();

    // Check for approval
    if (["approve", "approved", "looks good", "lgtm", "yes", "go ahead", "push it", "create them", "do it"].includes(text)) {
      await this.createTickets(ctx, data);
      return;
    }

    // Check for removal: "remove 3" or "delete 2"
    const removeMatch = text.match(/^(?:remove|delete)\s+(\d+)/);
    if (removeMatch) {
      const idx = parseInt(removeMatch[1]) - 1;
      if (idx >= 0 && idx < data.items.length) {
        data.items.splice(idx, 1);
        await updateConversation(conversation.threadTs, { data: data as unknown as Record<string, unknown> });
        await this.showUpdatedItems(channelId, conversation.threadTs, data);
      } else {
        await replyInThread(channelId, conversation.threadTs, `Item ${idx + 1} doesn't exist. There are ${data.items.length} items.`);
      }
      return;
    }

    // Check for edits: "change 2's due date to friday" or "change 1 assignee to John"
    const changeMatch = text.match(/^change\s+(\d+)(?:'s)?\s+(.*)/);
    if (changeMatch) {
      const idx = parseInt(changeMatch[1]) - 1;
      const changeText = changeMatch[2];

      if (idx >= 0 && idx < data.items.length) {
        await this.applyEdit(data, idx, changeText, ctx);
        await updateConversation(conversation.threadTs, { data: data as unknown as Record<string, unknown> });
        await this.showUpdatedItems(channelId, conversation.threadTs, data);
      } else {
        await replyInThread(channelId, conversation.threadTs, `Item ${idx + 1} doesn't exist. There are ${data.items.length} items.`);
      }
      return;
    }

    // If we can't parse the edit, ask for clarification
    await replyInThread(
      channelId,
      conversation.threadTs,
      `I didn't understand that. You can:\n• *approve* — create all tickets\n• *remove [number]* — remove an item\n• *change [number]'s [field] to [value]* — edit an item\n\nFields: title, assignee, client, due date, priority`
    );
  }

  private async applyEdit(
    data: TranscriptConversationData,
    idx: number,
    changeText: string,
    ctx: HandlerContext
  ): Promise<void> {
    const item = data.items[idx];

    // Parse what they want to change
    const dueDateMatch = changeText.match(/(?:due\s*date|due)\s+(?:to\s+)?(.+)/i);
    if (dueDateMatch) {
      // Use Claude to resolve the date
      const resolved = await this.resolveDate(dueDateMatch[1].trim());
      if (resolved) item.dueDate = resolved;
      return;
    }

    const assigneeMatch = changeText.match(/(?:assignee|assign)\s+(?:to\s+)?(.+)/i);
    if (assigneeMatch) {
      const name = assigneeMatch[1].trim();
      const { rows } = await sql`SELECT id, name FROM team_members WHERE active = true AND LOWER(name) LIKE ${`%${name.toLowerCase()}%`} LIMIT 1`;
      if (rows.length > 0) {
        item.assigneeName = rows[0].name as string;
        item.assigneeId = rows[0].id as number;
      }
      return;
    }

    const titleMatch = changeText.match(/(?:title)\s+(?:to\s+)?(.+)/i);
    if (titleMatch) {
      item.task = titleMatch[1].trim();
      return;
    }

    const priorityMatch = changeText.match(/(?:priority)\s+(?:to\s+)?(.+)/i);
    if (priorityMatch) {
      const p = priorityMatch[1].trim().toLowerCase();
      if (["low", "normal", "high", "urgent"].includes(p)) {
        item.priority = p as "low" | "normal" | "high" | "urgent";
      }
      return;
    }

    const clientMatch = changeText.match(/(?:client)\s+(?:to\s+)?(.+)/i);
    if (clientMatch) {
      const name = clientMatch[1].trim();
      const { rows } = await sql`SELECT id, name FROM clients WHERE active = true AND LOWER(name) LIKE ${`%${name.toLowerCase()}%`} LIMIT 1`;
      if (rows.length > 0) {
        item.clientName = rows[0].name as string;
        item.clientId = rows[0].id as number;
      }
      return;
    }
  }

  private async resolveDate(dateText: string): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const today = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 50,
          messages: [{
            role: "user",
            content: `Today is ${today}. Convert this to a date: "${dateText}". Return ONLY the date in YYYY-MM-DD format, nothing else.`,
          }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const content = data.content?.[0]?.text?.trim();
      if (content && /^\d{4}-\d{2}-\d{2}$/.test(content)) return content;
      return null;
    } catch {
      return null;
    }
  }

  private async showUpdatedItems(
    channelId: string,
    threadTs: string,
    data: TranscriptConversationData
  ): Promise<void> {
    if (data.items.length === 0) {
      await replyInThread(channelId, threadTs, "All items removed. Nothing to create.");
      return;
    }

    const itemsList = data.items
      .map((item, i) => {
        const assignee = item.assigneeName || "Unassigned";
        const client = item.clientName || "Internal";
        const due = item.dueDate || "No due date";
        const priority = item.priority !== "normal" ? ` [${item.priority}]` : "";
        return `${i + 1}. *${item.task}*${priority}\n   ${assignee} | ${client} | ${due}`;
      })
      .join("\n");

    await replyInThread(
      channelId,
      threadTs,
      `Updated — *${data.items.length} item${data.items.length !== 1 ? "s" : ""}*:\n\n${itemsList}\n\nReply *approve* to create these tickets, or keep editing.`
    );
  }

  private async createTickets(ctx: HandlerContext, data: TranscriptConversationData): Promise<void> {
    const { channelId, conversation, owner } = ctx;
    if (!conversation) return;

    await updateConversation(conversation.threadTs, { state: "creating_tickets" });

    const actor = { id: owner.id, name: "Slack Assistant" };
    const created: Array<{ ticketNumber: string; title: string }> = [];

    for (const item of data.items) {
      try {
        const ticket = await createTicket(
          {
            title: item.task,
            description: item.description || "",
            clientId: item.clientId ?? null,
            dueDate: item.dueDate ?? null,
            priority: item.priority || "normal",
            assigneeIds: item.assigneeId ? [item.assigneeId] : [],
          },
          owner.id,
          actor
        );

        if (item.dueDate && item.assigneeId) {
          await addCommitment({
            ticketId: ticket.id,
            teamMemberId: item.assigneeId,
            committedDate: item.dueDate,
            committedById: owner.id,
            notes: "Created from Slack meeting transcript",
          });
        }

        created.push({ ticketNumber: ticket.ticketNumber, title: ticket.title });
      } catch (err) {
        console.error("Failed to create ticket:", err);
      }
    }

    // Link to meeting note
    if (data.meetingNoteId && created.length > 0) {
      await sql`
        UPDATE meeting_notes
        SET raw_extraction = raw_extraction || ${JSON.stringify({ createdTickets: created })}::jsonb
        WHERE id = ${data.meetingNoteId}
      `;
    }

    await updateConversation(conversation.threadTs, { state: "done" });

    const ticketList = created.map((t) => `• *${t.ticketNumber}*: ${t.title}`).join("\n");
    await replyInThread(
      channelId,
      conversation.threadTs,
      `Created *${created.length} ticket${created.length !== 1 ? "s" : ""}*:\n\n${ticketList}`
    );
    await addSlackReaction(channelId, conversation.threadTs, "white_check_mark");
  }
}
