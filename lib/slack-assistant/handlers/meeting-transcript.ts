/**
 * Meeting transcript / task briefing handler.
 * Extracts action items, shows for review, creates tickets on approval.
 * Adapts to input type: transcripts → many tickets, direct tasks → fewer tickets.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext } from "../types";
import { createConversation, updateConversation } from "../conversation";
import { replyInThread, addSlackReaction } from "@/lib/slack";
import { extractActionItems, ExtractedItem, ExtractionOptions } from "@/lib/meeting-extraction";
import { createTicket } from "@/lib/tickets";
import { addCommitment } from "@/lib/commitments";

interface ResolvedItem extends ExtractedItem {
  assigneeIds: string[];
  clientId: string | null;
}

interface TranscriptConversationData {
  items: ResolvedItem[];
  summary: string;
  meetingNoteId: string | null;
}

export class MeetingTranscriptHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    if (ctx.conversation) {
      await this.handleContinuation(ctx);
    } else {
      await this.handleNew(ctx);
    }
  }

  private async handleNew(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, messageTs, user, classification } = ctx;

    // Get team member and client names for extraction
    const convex = getConvexClient();
    const [teamDocs, clientDocs] = await Promise.all([
      convex.query(api.teamMembers.list, { activeOnly: true }),
      convex.query(api.clients.list, {}),
    ]);
    const teamMembers = teamDocs.map((d: any) => ({ id: d._id as string, name: d.name as string }));
    const clients = clientDocs.map((d: any) => ({ id: d._id as string, name: d.name as string }));

    // Save as meeting note
    const meetingNoteDoc = await convex.mutation(api.meetingNotes.create, {
      teamMemberId: user.id as any,
      createdById: user.id as any,
      transcript: messageText,
      source: "slack",
      meetingDate: new Date().toISOString().split("T")[0],
    });
    const meetingNoteId = meetingNoteDoc?._id as string | null;

    // Determine extraction options from classification
    const estimatedCount = classification?.estimatedTicketCount;
    const expansionLevel = classification?.expansionLevel || "none";
    const inputType = estimatedCount === 1 ? "direct_task" as const
      : expansionLevel !== "none" ? "task_with_expansion" as const
      : "transcript" as const;

    const extractionOptions: ExtractionOptions = {
      inputType,
      expansionLevel,
      source: "slack",
    };

    // Extract with retry on failure
    let extraction: { items: ExtractedItem[]; summary: string };
    try {
      extraction = await extractActionItems(
        messageText,
        teamMembers.map((t) => t.name),
        clients.map((c) => c.name),
        "team",
        extractionOptions
      );
    } catch {
      // Retry once
      try {
        extraction = await extractActionItems(
          messageText,
          teamMembers.map((t) => t.name),
          clients.map((c) => c.name),
          "team",
          extractionOptions
        );
      } catch {
        await replyInThread(
          channelId,
          messageTs,
          `I had trouble parsing that. Here's what I received — you can try rephrasing or paste it again:\n\n\`\`\`${messageText.slice(0, 500)}${messageText.length > 500 ? "..." : ""}\`\`\``
        );
        return;
      }
    }

    if (extraction.items.length === 0) {
      await replyInThread(channelId, messageTs, "I didn't find any action items. If you meant this as something else, let me know!");
      await addSlackReaction(channelId, messageTs, "eyes");
      return;
    }

    // Resolve names to IDs
    const resolvedItems: ResolvedItem[] = extraction.items.map((item) => {
      const assigneeIds = item.assigneeNames
        .map((name) => teamMembers.find((t) => t.name.toLowerCase() === name.toLowerCase())?.id)
        .filter(Boolean) as string[];
      const clientMatch = clients.find(
        (c) => c.name.toLowerCase() === item.clientName.toLowerCase()
      );
      return {
        ...item,
        assigneeIds,
        clientId: clientMatch?.id ?? null,
      };
    });

    // Store conversation
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
      userId: user.id,
    });

    // Format and send for review
    await this.showItems(channelId, messageTs, resolvedItems, extraction.summary);
    await addSlackReaction(channelId, messageTs, "memo");
  }

  private async showItems(
    channelId: string,
    threadTs: string,
    items: ResolvedItem[],
    summary: string
  ): Promise<void> {
    if (items.length === 0) {
      await replyInThread(channelId, threadTs, "All items removed. Nothing to create.");
      return;
    }

    const itemsList = items
      .map((item, i) => {
        const assignees = item.assigneeNames.join(", ") || "Unassigned";
        const client = item.clientName || "Internal";
        const due = item.dueDate || "No due date";
        const priority = item.priority !== "normal" ? ` [${item.priority}]` : "";
        const links = item.links.length > 0 ? `\n   Links: ${item.links.length}` : "";
        return `${i + 1}. *${item.task}*${priority}\n   ${assignees} | ${client} | ${due}${links}`;
      })
      .join("\n");

    const count = items.length;
    const noun = count === 1 ? "ticket" : "tickets";
    await replyInThread(
      channelId,
      threadTs,
      `I'll create *${count} ${noun}*:\n\n${itemsList}\n\n_${summary}_\n\nReply *approve* to create, or tell me what to change (e.g., "remove 3", "change 2's due date to Friday", "combine into 1 ticket").`
    );
  }

  private async handleContinuation(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, conversation } = ctx;
    if (!conversation) return;

    const data = conversation.data as unknown as TranscriptConversationData;
    const text = messageText.toLowerCase().trim();

    // Approval
    if (["approve", "approved", "looks good", "lgtm", "yes", "go ahead", "push it", "create them", "do it"].includes(text)) {
      await this.createTickets(ctx, data);
      return;
    }

    // Consolidation
    const consolidateMatch = text.match(/(?:make|combine|merge|just|into)\s*(?:this|them|all|it)?\s*(?:into|as|just)?\s*(?:one|1)\s*(?:ticket|task)?/i) ||
      text.match(/^(?:one|1)\s*ticket/i);
    if (consolidateMatch) {
      await this.consolidateItems(ctx, data);
      return;
    }

    // Removal
    const removeMatch = text.match(/^(?:remove|delete)\s+(\d+)/);
    if (removeMatch) {
      const idx = parseInt(removeMatch[1]) - 1;
      if (idx >= 0 && idx < data.items.length) {
        data.items.splice(idx, 1);
        await updateConversation(conversation.threadTs, { data: data as unknown as Record<string, unknown> });
        await this.showItems(channelId, conversation.threadTs, data.items, data.summary);
      } else {
        await replyInThread(channelId, conversation.threadTs, `Item ${idx + 1} doesn't exist. There are ${data.items.length} items.`);
      }
      return;
    }

    // Edits
    const changeMatch = text.match(/^change\s+(\d+)(?:'s)?\s+(.*)/);
    if (changeMatch) {
      const idx = parseInt(changeMatch[1]) - 1;
      if (idx >= 0 && idx < data.items.length) {
        await this.applyEdit(data, idx, changeMatch[2]);
        await updateConversation(conversation.threadTs, { data: data as unknown as Record<string, unknown> });
        await this.showItems(channelId, conversation.threadTs, data.items, data.summary);
      } else {
        await replyInThread(channelId, conversation.threadTs, `Item ${idx + 1} doesn't exist. There are ${data.items.length} items.`);
      }
      return;
    }

    await replyInThread(
      channelId,
      conversation.threadTs,
      `I didn't understand that. You can:\n• *approve* — create tickets\n• *combine into 1 ticket* — merge all items\n• *remove [number]* — remove an item\n• *change [number]'s [field] to [value]* — edit an item`
    );
  }

  private async consolidateItems(ctx: HandlerContext, data: TranscriptConversationData): Promise<void> {
    const { channelId, conversation } = ctx;
    if (!conversation || data.items.length === 0) return;

    const allAssigneeIds = [...new Set(data.items.flatMap((i) => i.assigneeIds))];
    const allAssigneeNames = [...new Set(data.items.flatMap((i) => i.assigneeNames).filter(Boolean))];
    const allClientNames = [...new Set(data.items.map((i) => i.clientName).filter((n) => n && n !== "Internal"))];
    const allLinks = [...new Set(data.items.flatMap((i) => i.links))];

    const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
    const highestPriority = data.items.reduce((best, item) => {
      return (priorityOrder[item.priority] || 0) > (priorityOrder[best] || 0) ? item.priority : best;
    }, "normal" as "low" | "normal" | "high" | "urgent");

    const dueDates = data.items.map((i) => i.dueDate).filter(Boolean) as string[];
    const earliestDue = dueDates.length > 0 ? dueDates.sort()[0] : null;

    const shortTitle = await this.generateShortTitle(data.items, data.summary);

    // Build structured description from all items
    const descParts: string[] = [];
    if (data.summary) {
      descParts.push(data.summary, "");
    }
    descParts.push("## Action Items", "");
    data.items.forEach((item, i) => {
      descParts.push(`### ${i + 1}. ${item.task}`);
      if (item.description) descParts.push(item.description);
      descParts.push("");
    });
    if (allLinks.length > 0) {
      descParts.push("## Resources", "");
      allLinks.forEach((link) => descParts.push(`- ${link}`));
    }

    const originalCount = data.items.length;

    const consolidated: ResolvedItem = {
      task: shortTitle,
      description: descParts.join("\n"),
      assigneeNames: allAssigneeNames,
      assigneeIds: allAssigneeIds,
      clientName: allClientNames[0] || "Internal",
      clientId: data.items.find((i) => i.clientId)?.clientId ?? null,
      dueDate: earliestDue,
      priority: highestPriority,
      sourceContext: null,
      links: allLinks,
    };

    data.items = [consolidated];
    await updateConversation(conversation.threadTs, { data: data as unknown as Record<string, unknown> });

    const assigneeDisplay = allAssigneeNames.join(", ") || "Unassigned";
    const clientDisplay = allClientNames.join(", ") || "Internal";

    await replyInThread(
      channelId,
      conversation.threadTs,
      `Consolidated into *1 ticket*:\n\n*${consolidated.task}*\nPriority: ${consolidated.priority} | Due: ${consolidated.dueDate || "none"}\nAssignees: ${assigneeDisplay}\nClient: ${clientDisplay}\n\n_${originalCount} action items in the description._\n\nReply *approve* to create, or tell me what to change.`
    );
  }

  private async applyEdit(data: TranscriptConversationData, idx: number, changeText: string): Promise<void> {
    const item = data.items[idx];

    const dueDateMatch = changeText.match(/(?:due\s*date|due)\s+(?:to\s+)?(.+)/i);
    if (dueDateMatch) {
      const resolved = await this.resolveDate(dueDateMatch[1].trim());
      if (resolved) item.dueDate = resolved;
      return;
    }

    const assigneeMatch = changeText.match(/(?:assignee|assign)\s+(?:to\s+)?(.+)/i);
    if (assigneeMatch) {
      const name = assigneeMatch[1].trim();
      const convex = getConvexClient();
      const teamDocs = await convex.query(api.teamMembers.list, { activeOnly: true });
      const match = (teamDocs as any[]).find(
        (t: any) => (t.name as string).toLowerCase().includes(name.toLowerCase())
      );
      if (match) {
        item.assigneeNames = [match.name as string];
        item.assigneeIds = [match._id as string];
      }
      return;
    }

    const titleMatch = changeText.match(/(?:title)\s+(?:to\s+)?(.+)/i);
    if (titleMatch) { item.task = titleMatch[1].trim(); return; }

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
      const convex = getConvexClient();
      const clientDocs = await convex.query(api.clients.list, {});
      const match = (clientDocs as any[]).find(
        (c: any) => (c.name as string).toLowerCase().includes(name.toLowerCase())
      );
      if (match) {
        item.clientName = match.name as string;
        item.clientId = match._id as string;
      }
      return;
    }
  }

  private async generateShortTitle(items: Array<{ task: string }>, summary: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return items[0]?.task || "Consolidated ticket";

    try {
      const taskList = items.map((i) => i.task).join(", ");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 50,
          messages: [{ role: "user", content: `Generate a short ticket title (5-8 words max, imperative form) that summarizes these tasks:\n\nTasks: ${taskList}\nContext: ${summary}\n\nReturn ONLY the title, nothing else.` }],
        }),
      });
      if (!res.ok) return items[0]?.task || "Consolidated ticket";
      const data = await res.json();
      return data.content?.[0]?.text?.trim() || items[0]?.task || "Consolidated ticket";
    } catch {
      return items[0]?.task || "Consolidated ticket";
    }
  }

  private async resolveDate(dateText: string): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const today = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 50,
          messages: [{ role: "user", content: `Today is ${today}. Convert this to a date: "${dateText}". If the day has already passed this week, use next week. Return ONLY YYYY-MM-DD.` }],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const content = data.content?.[0]?.text?.trim();
      return content && /^\d{4}-\d{2}-\d{2}$/.test(content) ? content : null;
    } catch {
      return null;
    }
  }

  private async createTickets(ctx: HandlerContext, data: TranscriptConversationData): Promise<void> {
    const { channelId, conversation, user } = ctx;
    if (!conversation) return;

    await updateConversation(conversation.threadTs, { state: "creating_tickets" });
    const actor = { id: user.id as any, name: "Slack Assistant" };
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
            assigneeIds: item.assigneeIds,
          },
          user.id as any,
          actor
        );

        // Create commitments for all assignees
        if (item.dueDate) {
          for (const assigneeId of item.assigneeIds) {
            await addCommitment({
              ticketId: ticket.id,
              teamMemberId: assigneeId as any,
              committedDate: item.dueDate,
              committedById: user.id as any,
              notes: "Created from Slack",
            });
          }
        }

        created.push({ ticketNumber: ticket.ticketNumber, title: ticket.title });
      } catch (err) {
        console.error("Failed to create ticket:", err);
      }
    }

    // Link to meeting note
    if (data.meetingNoteId && created.length > 0) {
      try {
        const convex = getConvexClient();
        await convex.mutation(api.meetingNotes.update, {
          id: data.meetingNoteId as any,
          rawExtraction: { createdTickets: created },
        });
      } catch (err) {
        console.error("Failed to update meeting note:", err);
      }
    }

    await updateConversation(conversation.threadTs, { state: "done" });

    const ticketList = created.map((t) => `• *${t.ticketNumber}*: ${t.title}`).join("\n");
    await replyInThread(channelId, conversation.threadTs, `Created *${created.length} ticket${created.length !== 1 ? "s" : ""}*:\n\n${ticketList}`);
    await addSlackReaction(channelId, conversation.threadTs, "white_check_mark");
  }
}
