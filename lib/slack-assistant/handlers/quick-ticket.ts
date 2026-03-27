/**
 * Quick ticket handler.
 * Creates a ticket from natural language, always confirming before creation.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext, QuickTicketData } from "../types";
import { createConversation, updateConversation } from "../conversation";
import { replyInThread, addSlackReaction } from "@/lib/slack";
import { createTicket } from "@/lib/tickets";
import { addCommitment } from "@/lib/commitments";

interface TicketDraft {
  title: string;
  description: string | null;
  assigneeName: string | null;
  assigneeId: string | null;
  clientName: string | null;
  clientId: string | null;
  dueDate: string | null;
  priority: "low" | "normal" | "high" | "urgent";
}

export class QuickTicketHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { conversation } = ctx;

    if (conversation) {
      await this.handleContinuation(ctx);
    } else {
      await this.handleNew(ctx);
    }
  }

  private async handleNew(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, messageTs, user, classification } = ctx;
    const data = classification?.data as QuickTicketData | undefined;

    // Resolve names to IDs
    const draft: TicketDraft = {
      title: data?.title || messageText,
      description: data?.description || null,
      assigneeName: null,
      assigneeId: null,
      clientName: null,
      clientId: null,
      dueDate: data?.dueDate || null,
      priority: data?.priority || "normal",
    };

    const convex = getConvexClient();

    if (data?.assigneeName) {
      const teamDocs = await convex.query(api.teamMembers.list, { activeOnly: true }) as any[];
      const match = teamDocs.find(
        (t: any) => (t.name as string).toLowerCase().includes(data.assigneeName!.toLowerCase())
      );
      if (match) {
        draft.assigneeName = match.name as string;
        draft.assigneeId = match._id as string;
      } else {
        draft.assigneeName = data.assigneeName;
      }
    }

    if (data?.clientName) {
      const clientDocs = await convex.query(api.clients.list, {}) as any[];
      const match = clientDocs.find(
        (c: any) => (c.name as string).toLowerCase().includes(data.clientName!.toLowerCase())
      );
      if (match) {
        draft.clientName = match.name as string;
        draft.clientId = match._id as string;
      } else {
        draft.clientName = data.clientName;
      }
    }

    // Check what's missing
    const missing: string[] = [];
    if (!draft.assigneeName) missing.push("assignee");
    if (!draft.clientName) missing.push("client");
    if (!draft.dueDate) missing.push("due date");

    // Create conversation for the confirmation flow
    await createConversation({
      threadTs: messageTs,
      channelId,
      intent: "quick_ticket",
      state: missing.length > 0 ? "awaiting_info" : "awaiting_approval",
      data: { draft } as unknown as Record<string, unknown>,
      userId: user.id,
    });

    if (missing.length > 0) {
      // Ask for missing info
      const preview = this.formatDraft(draft);
      await replyInThread(
        channelId,
        messageTs,
        `Here's what I have so far:\n${preview}\n\nI'm missing: *${missing.join(", ")}*. Could you provide ${missing.length === 1 ? "it" : "them"}?`
      );
    } else {
      // Show confirmation
      const preview = this.formatDraft(draft);
      await replyInThread(
        channelId,
        messageTs,
        `Here's what I'll create:\n${preview}\n\nReply *approve* to create, or tell me what to change.`
      );
    }
  }

  private async handleContinuation(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, conversation, user } = ctx;
    if (!conversation) return;

    const convData = conversation.data as { draft: TicketDraft };
    const draft = convData.draft;
    const text = messageText.toLowerCase().trim();

    // Check for approval
    if (["approve", "approved", "looks good", "lgtm", "yes", "go ahead", "create it", "do it"].includes(text)) {
      if (!draft.title) {
        await replyInThread(channelId, conversation.threadTs, "I still need at least a title for the ticket.");
        return;
      }
      await this.createTheTicket(ctx, draft);
      return;
    }

    // Try to parse the response as filling in missing info or making edits
    await this.parseAndApplyUpdates(draft, messageText);

    // Update conversation
    const missing: string[] = [];
    if (!draft.assigneeName) missing.push("assignee");
    if (!draft.clientName) missing.push("client");
    if (!draft.dueDate) missing.push("due date");

    const newState = missing.length > 0 ? "awaiting_info" : "awaiting_approval";
    await updateConversation(conversation.threadTs, {
      state: newState,
      data: { draft } as unknown as Record<string, unknown>,
    });

    const preview = this.formatDraft(draft);
    if (missing.length > 0) {
      await replyInThread(
        channelId,
        conversation.threadTs,
        `Updated:\n${preview}\n\nStill missing: *${missing.join(", ")}*. Or reply *approve* to create as-is.`
      );
    } else {
      await replyInThread(
        channelId,
        conversation.threadTs,
        `Here's what I'll create:\n${preview}\n\nReply *approve* to create, or tell me what to change.`
      );
    }
  }

  private async parseAndApplyUpdates(draft: TicketDraft, text: string): Promise<void> {
    // Use Claude to parse the natural language update
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return;

    const today = new Date().toISOString().split("T")[0];

    try {
      const convex = getConvexClient();
      const [teamDocs, clientDocs] = await Promise.all([
        convex.query(api.teamMembers.list, { activeOnly: true }),
        convex.query(api.clients.list, {}),
      ]);
      const teamMembers = (teamDocs as any[]).map((d: any) => ({ id: d._id as string, name: d.name as string }));
      const clients = (clientDocs as any[]).map((d: any) => ({ id: d._id as string, name: d.name as string }));

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `Parse this response into ticket field updates. Today is ${today}.

Current ticket draft:
- Title: ${draft.title}
- Assignee: ${draft.assigneeName || "none"}
- Client: ${draft.clientName || "none"}
- Due date: ${draft.dueDate || "none"}
- Priority: ${draft.priority}

Team members: ${teamMembers.map((t) => t.name).join(", ")}
Clients: ${clients.map((c) => c.name).join(", ")}

User response: "${text}"

Extract any updates. Return ONLY JSON (no fences):
{"assigneeName": "exact name or null", "clientName": "exact name or null", "dueDate": "YYYY-MM-DD or null", "priority": "low|normal|high|urgent or null", "title": "new title or null"}

Only include fields that the user is updating. Use null for unchanged fields. Use EXACT names from the lists.`,
          }],
        }),
      });

      if (!res.ok) return;
      const responseData = await res.json();
      const content = responseData.content?.[0]?.text?.trim();
      if (!content) return;

      const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const updates = JSON.parse(jsonStr);

      if (updates.title) draft.title = updates.title;
      if (updates.priority) draft.priority = updates.priority;
      if (updates.dueDate) draft.dueDate = updates.dueDate;

      if (updates.assigneeName) {
        const match = teamMembers.find(
          (t) => t.name.toLowerCase() === updates.assigneeName.toLowerCase()
        );
        if (match) {
          draft.assigneeName = match.name;
          draft.assigneeId = match.id;
        }
      }

      if (updates.clientName) {
        const match = clients.find(
          (c) => c.name.toLowerCase() === updates.clientName.toLowerCase()
        );
        if (match) {
          draft.clientName = match.name;
          draft.clientId = match.id;
        }
      }
    } catch {
      // Best effort
    }
  }

  private formatDraft(draft: TicketDraft): string {
    const lines = [`• *${draft.title}*`];
    lines.push(`  Assignee: ${draft.assigneeName || "_not set_"}`);
    lines.push(`  Client: ${draft.clientName || "_not set_"}`);
    lines.push(`  Due: ${draft.dueDate || "_not set_"}`);
    if (draft.priority !== "normal") lines.push(`  Priority: ${draft.priority}`);
    return lines.join("\n");
  }

  private async createTheTicket(ctx: HandlerContext, draft: TicketDraft): Promise<void> {
    const { channelId, conversation, user } = ctx;
    if (!conversation) return;

    await updateConversation(conversation.threadTs, { state: "creating" });

    const actor = { id: user.id as any, name: "Slack Assistant" };

    try {
      const ticket = await createTicket(
        {
          title: draft.title,
          description: draft.description || "",
          clientId: draft.clientId ?? null,
          dueDate: draft.dueDate ?? null,
          priority: draft.priority || "normal",
          assigneeIds: draft.assigneeId ? [draft.assigneeId] : [],
        },
        user.id as any,
        actor
      );

      if (draft.dueDate && draft.assigneeId) {
        await addCommitment({
          ticketId: ticket.id,
          teamMemberId: draft.assigneeId as any,
          committedDate: draft.dueDate,
          committedById: user.id as any,
          notes: "Created from Slack",
        });
      }

      await updateConversation(conversation.threadTs, { state: "done" });
      await replyInThread(
        channelId,
        conversation.threadTs,
        `Created *${ticket.ticketNumber}*: ${ticket.title}`
      );
      await addSlackReaction(channelId, conversation.threadTs, "white_check_mark");
    } catch (err) {
      console.error("Failed to create ticket:", err);
      await replyInThread(channelId, conversation.threadTs, "Something went wrong creating the ticket. Please try again.");
    }
  }
}
