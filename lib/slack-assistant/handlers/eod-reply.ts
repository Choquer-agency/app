/**
 * EOD Reply Handler.
 * Processes team member replies to end-of-day check-in messages.
 * Parses per-ticket updates, pushes back on vague timelines,
 * proposes actions (status changes, blocker tagging, commitment creation, email drafts).
 * All actions require confirmation before executing.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext } from "../types";
import { createConversation, updateConversation } from "../conversation";
import { replyInThread, addSlackReaction } from "@/lib/slack";
import { updateTicket } from "@/lib/tickets";
import { addCommitment } from "@/lib/commitments";

interface TicketContext {
  ticketId: string;
  ticketNumber: string;
  title: string;
  clientName: string | null;
  isCommitmentDue: boolean;
}

interface ProposedAction {
  ticketNumber: string;
  ticketId: string;
  type: "status_change" | "blocker" | "commitment" | "email_draft" | "comment";
  description: string;
  data: Record<string, unknown>;
}

interface EodConversationData {
  tickets: TicketContext[];
  proposedActions: ProposedAction[];
  pendingClarification: string[]; // ticket numbers needing timeline clarity
  emailDraftTicket?: string; // ticket number for email draft flow
  emailDraftContext?: string; // additional context for email draft
}

export class EodReplyHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { conversation } = ctx;

    if (conversation) {
      await this.handleContinuation(ctx);
    } else {
      await this.handleNew(ctx);
    }
  }

  private async handleNew(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, messageTs, threadTs, user, classification } = ctx;

    // Get the ticket context from the original EOD check-in
    const eodData = classification?.data as { eodMessageData?: { tickets?: TicketContext[] } } | undefined;
    const tickets: TicketContext[] = eodData?.eodMessageData?.tickets || [];

    if (tickets.length === 0) {
      await replyInThread(channelId, threadTs || messageTs, "I couldn't find the tickets from your check-in. Could you tell me which tickets you're updating?");
      return;
    }

    // Parse the reply using Claude
    const parsed = await this.parseEodReply(messageText, tickets, user.name);

    if (!parsed) {
      await replyInThread(channelId, threadTs || messageTs, "I had trouble understanding your reply. Could you try again? For each ticket, let me know the status — done, in progress, stuck, etc.");
      return;
    }

    const { actions, vagueTickets } = parsed;

    // Create conversation for the confirmation flow
    const conversationData: EodConversationData = {
      tickets,
      proposedActions: actions,
      pendingClarification: vagueTickets,
    };

    await createConversation({
      threadTs: threadTs || messageTs,
      channelId,
      intent: "eod_reply",
      state: vagueTickets.length > 0 ? "awaiting_clarity" : "awaiting_approval",
      data: conversationData as unknown as Record<string, unknown>,
      userId: user.id,
    });

    // If there are vague timelines, push back for clarity first
    if (vagueTickets.length > 0) {
      const vagueList = vagueTickets.map((tn) => `*${tn}*`).join(", ");
      const actionsSummary = actions.length > 0 ? this.formatActions(actions) + "\n\n" : "";
      await replyInThread(
        channelId,
        threadTs || messageTs,
        `${actionsSummary}For ${vagueList} — you mentioned a delay but didn't give a new timeline. When do you think you'll have ${vagueTickets.length === 1 ? "it" : "them"} wrapped up? I'll update the due date and let the team know.`
      );
    } else if (actions.length > 0) {
      await replyInThread(
        channelId,
        threadTs || messageTs,
        `Here's what I'd do:\n\n${this.formatActions(actions)}\n\nReply *approve* to execute, or tell me what to change.`
      );
    } else {
      await replyInThread(
        channelId,
        threadTs || messageTs,
        "Got it, thanks for the update! No actions needed on my end."
      );
    }
  }

  private async handleContinuation(ctx: HandlerContext): Promise<void> {
    const { messageText, channelId, conversation, user } = ctx;
    if (!conversation) return;

    const data = conversation.data as unknown as EodConversationData;
    const text = messageText.toLowerCase().trim();

    // Check for approval
    if (["approve", "approved", "looks good", "lgtm", "yes", "go ahead", "do it"].includes(text)) {
      if (data.pendingClarification.length > 0) {
        await replyInThread(
          channelId,
          conversation.threadTs,
          `I still need a timeline for ${data.pendingClarification.map((t) => `*${t}*`).join(", ")}. When do you expect to have ${data.pendingClarification.length === 1 ? "it" : "them"} done?`
        );
        return;
      }
      await this.executeActions(ctx, data);
      return;
    }

    // Check if this is an email draft flow
    if (data.emailDraftTicket && conversation.state === "awaiting_email_context") {
      await this.handleEmailDraftResponse(ctx, data);
      return;
    }

    // If we're awaiting clarity, try to parse dates from the response
    if (conversation.state === "awaiting_clarity" && data.pendingClarification.length > 0) {
      await this.handleClarityResponse(ctx, data);
      return;
    }

    // If awaiting approval, check for modifications
    await replyInThread(
      channelId,
      conversation.threadTs,
      "Reply *approve* to execute the actions, or tell me what to change."
    );
  }

  private async handleClarityResponse(ctx: HandlerContext, data: EodConversationData): Promise<void> {
    const { messageText, channelId, conversation, user } = ctx;
    if (!conversation) return;

    // Parse the response for dates
    const dates = await this.extractDates(messageText, data.pendingClarification);

    if (!dates || Object.keys(dates).length === 0) {
      await replyInThread(
        channelId,
        conversation.threadTs,
        "I couldn't parse a date from that. Could you give me a specific day? Like \"Tuesday\" or \"end of week\" or \"April 2\"."
      );
      return;
    }

    // Create commitment actions for the clarified tickets
    for (const [ticketNumber, date] of Object.entries(dates)) {
      const ticket = data.tickets.find((t) => t.ticketNumber === ticketNumber);
      if (!ticket) continue;

      data.proposedActions.push({
        ticketNumber,
        ticketId: ticket.ticketId,
        type: "commitment",
        description: `Update due date to ${date} and create commitment`,
        data: { newDueDate: date, teamMemberId: user.id },
      });

      // Remove from pending
      data.pendingClarification = data.pendingClarification.filter((t) => t !== ticketNumber);
    }

    if (data.pendingClarification.length > 0) {
      await updateConversation(conversation.threadTs, { data: data as unknown as Record<string, unknown> });
      const remaining = data.pendingClarification.map((t) => `*${t}*`).join(", ");
      await replyInThread(
        channelId,
        conversation.threadTs,
        `Got it. Still need a timeline for ${remaining}. When do you expect to finish?`
      );
    } else {
      // All clarified — show full action plan
      await updateConversation(conversation.threadTs, {
        state: "awaiting_approval",
        data: data as unknown as Record<string, unknown>,
      });
      await replyInThread(
        channelId,
        conversation.threadTs,
        `Here's the full action plan:\n\n${this.formatActions(data.proposedActions)}\n\nReply *approve* to execute, or tell me what to change.`
      );
    }
  }

  private async handleEmailDraftResponse(ctx: HandlerContext, data: EodConversationData): Promise<void> {
    const { messageText, channelId, conversation, user } = ctx;
    if (!conversation || !data.emailDraftTicket) return;

    const ticket = data.tickets.find((t) => t.ticketNumber === data.emailDraftTicket);
    if (!ticket) return;

    // Generate email draft
    const draft = await this.generateEmailDraft(ticket, messageText, user.name);

    if (draft) {
      data.emailDraftContext = undefined;
      data.emailDraftTicket = undefined;
      await updateConversation(conversation.threadTs, {
        state: "awaiting_approval",
        data: data as unknown as Record<string, unknown>,
      });

      await replyInThread(
        channelId,
        conversation.threadTs,
        `Here's a draft email for ${ticket.clientName || "the client"}:\n\n---\n${draft}\n---\n\nFeel free to copy, edit, and send. Now, reply *approve* to execute the other pending actions, or tell me what to change.`
      );
    } else {
      await replyInThread(channelId, conversation.threadTs, "I had trouble drafting that email. Could you try giving me more context?");
    }
  }

  private async executeActions(ctx: HandlerContext, data: EodConversationData): Promise<void> {
    const { channelId, conversation, user } = ctx;
    if (!conversation) return;

    await updateConversation(conversation.threadTs, { state: "executing" });

    const actor = { id: user.id as any, name: `${user.name} (via Slack)` };
    const results: string[] = [];

    for (const action of data.proposedActions) {
      try {
        switch (action.type) {
          case "status_change": {
            const newStatus = action.data.newStatus as string;
            await updateTicket(action.ticketId, { status: newStatus as any }, actor);
            results.push(`${action.ticketNumber}: status → ${newStatus.replace(/_/g, " ")}`);
            break;
          }

          case "blocker": {
            const blockedByName = action.data.blockedByName as string;
            const blockedById = action.data.blockedById as string | undefined;
            const reason = action.data.reason as string;

            // Update ticket status to stuck
            await updateTicket(action.ticketId, { status: "stuck" as any }, actor);

            // Add comment on the ticket
            const convex = getConvexClient();
            await convex.mutation(api.ticketComments.create, {
              ticketId: action.ticketId as any,
              authorType: "team",
              authorId: user.id as any,
              authorName: user.name,
              content: `Waiting on ${blockedByName}: ${reason}`,
            });

            // Create blocker escalation record
            await convex.mutation(api.blockerEscalations.create, {
              ticketId: action.ticketId as any,
              reportedById: user.id as any,
              blockedById: blockedById ? (blockedById as any) : undefined,
              blockerDescription: `Waiting on ${blockedByName}: ${reason}`,
              acknowledged: false,
              escalatedToOwner: false,
            });

            // Notify the blocked person via Slack
            if (blockedById) {
              const blockedMember = await convex.query(api.teamMembers.getById, { id: blockedById as any });
              if (blockedMember?.slackUserId) {
                const { sendSlackDM } = await import("@/lib/slack");
                await sendSlackDM(
                  blockedMember.slackUserId as string,
                  `Hey ${(blockedMember.name as string).split(" ")[0]}, ${user.name.split(" ")[0]} is waiting on you for *${action.ticketNumber}* (${data.tickets.find((t) => t.ticketNumber === action.ticketNumber)?.title || ""}).\n\nContext: ${reason}\n\nCan you take a look?`
                );
              }
            }

            results.push(`${action.ticketNumber}: marked stuck, tagged ${blockedByName}`);
            break;
          }

          case "commitment": {
            const newDueDate = action.data.newDueDate as string;
            const teamMemberId = action.data.teamMemberId as string;

            // Update ticket due date
            await updateTicket(action.ticketId, { dueDate: newDueDate } as any, actor);

            // Create commitment
            await addCommitment({
              ticketId: action.ticketId,
              teamMemberId: teamMemberId as any,
              committedDate: newDueDate,
              committedById: user.id as any,
              notes: "Committed via Slack EOD reply",
            });

            results.push(`${action.ticketNumber}: due date → ${newDueDate}, commitment created`);
            break;
          }

          case "comment": {
            const commentText = action.data.comment as string;
            const convex = getConvexClient();
            await convex.mutation(api.ticketComments.create, {
              ticketId: action.ticketId as any,
              authorType: "team",
              authorId: user.id as any,
              authorName: user.name,
              content: commentText,
            });
            results.push(`${action.ticketNumber}: comment added`);
            break;
          }

          case "email_draft":
            // Email drafts are handled in-conversation, not in bulk execute
            break;
        }
      } catch (err) {
        console.error(`[eod-reply] Failed to execute action for ${action.ticketNumber}:`, err);
        results.push(`${action.ticketNumber}: failed — ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    await updateConversation(conversation.threadTs, { state: "done" });

    if (results.length > 0) {
      await replyInThread(
        channelId,
        conversation.threadTs,
        `Done! Here's what I updated:\n\n${results.map((r) => `• ${r}`).join("\n")}`
      );
      await addSlackReaction(channelId, conversation.threadTs, "white_check_mark");
    } else {
      await replyInThread(channelId, conversation.threadTs, "All set — nothing to update.");
    }
  }

  /**
   * Parse an EOD reply using Claude to extract per-ticket updates.
   */
  private async parseEodReply(
    replyText: string,
    tickets: TicketContext[],
    memberName: string
  ): Promise<{ actions: ProposedAction[]; vagueTickets: string[] } | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const convex = getConvexClient();
    const teamDocs = await convex.query(api.teamMembers.list, { activeOnly: true });
    const teamMembers = (teamDocs as any[]).map((d: any) => ({
      id: d._id as string,
      name: d.name as string,
      slackUserId: d.slackUserId as string | undefined,
    }));

    const todayStr = new Date().toISOString().split("T")[0];
    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const ticketList = tickets.map((t) =>
      `- ${t.ticketNumber}: "${t.title}" (client: ${t.clientName || "Internal"}${t.isCommitmentDue ? ", COMMITTED TO FINISH TODAY" : ""})`
    ).join("\n");

    const teamList = teamMembers.map((t) => t.name).join(", ");

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
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `You are parsing an end-of-day reply from a team member at a digital agency. They were asked about these tickets:

${ticketList}

Team member: ${memberName}
Today: ${dayOfWeek}, ${todayStr}
Timezone: America/Toronto (Eastern)
Team members: ${teamList}

Their reply: "${replyText}"

For EACH ticket they mention, determine:
1. Is the work done? → propose status change to "qa_ready" or "client_review" (use client_review if they mention sending to client)
2. Are they stuck / waiting on someone? → propose marking as "stuck" and identify WHO they're waiting on (match to team member names)
3. Did they mention being delayed WITHOUT giving a new date? → flag as "vague_timeline"
4. Did they commit to a specific date? → propose a commitment with that date (resolve relative dates: "Thursday" = upcoming Thursday, YYYY-MM-DD)
5. Do they need to email a client? → flag as "needs_email"

IMPORTANT RULES:
- If a team member says something vague like "still working on it", "sorry I'm delayed", "not done yet" WITHOUT a specific date → mark as vague_timeline
- Resolve all relative dates to YYYY-MM-DD format
- Match people names to the closest team member name from the list
- If the reply doesn't clearly reference specific tickets, apply the update to the most likely ticket based on context

Return ONLY this JSON (no markdown fences):
{
  "ticketUpdates": [
    {
      "ticketNumber": "CHQ-XXX",
      "action": "status_change" | "blocker" | "commitment" | "vague_timeline" | "needs_email" | "done_no_action",
      "newStatus": "qa_ready" | "client_review" | "stuck" | null,
      "blockedByName": "person name or null",
      "blockerReason": "reason or null",
      "commitmentDate": "YYYY-MM-DD or null",
      "summary": "brief summary of what they said about this ticket"
    }
  ]
}`,
          }],
        }),
      });

      if (!res.ok) return null;
      const responseData = await res.json();
      const content = responseData.content?.[0]?.text?.trim();
      if (!content) return null;

      const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(jsonStr);

      const actions: ProposedAction[] = [];
      const vagueTickets: string[] = [];

      for (const update of parsed.ticketUpdates || []) {
        const ticket = tickets.find((t) => t.ticketNumber === update.ticketNumber);
        if (!ticket) continue;

        switch (update.action) {
          case "status_change":
            if (update.newStatus) {
              actions.push({
                ticketNumber: update.ticketNumber,
                ticketId: ticket.ticketId,
                type: "status_change",
                description: `Move to "${update.newStatus.replace(/_/g, " ")}"`,
                data: { newStatus: update.newStatus },
              });
            }
            break;

          case "blocker": {
            const blockedMember = update.blockedByName
              ? teamMembers.find((t) => t.name.toLowerCase().includes(update.blockedByName.toLowerCase()))
              : null;
            actions.push({
              ticketNumber: update.ticketNumber,
              ticketId: ticket.ticketId,
              type: "blocker",
              description: `Mark stuck, tag ${update.blockedByName || "unknown"}${update.blockerReason ? ` — ${update.blockerReason}` : ""}`,
              data: {
                blockedByName: update.blockedByName,
                blockedById: blockedMember?.id || null,
                reason: update.blockerReason || "Waiting for response",
              },
            });
            break;
          }

          case "commitment":
            if (update.commitmentDate) {
              actions.push({
                ticketNumber: update.ticketNumber,
                ticketId: ticket.ticketId,
                type: "commitment",
                description: `Update due date to ${update.commitmentDate} and create commitment`,
                data: { newDueDate: update.commitmentDate, teamMemberId: "" }, // filled in during execute
              });
            }
            break;

          case "vague_timeline":
            vagueTickets.push(update.ticketNumber);
            break;

          case "needs_email":
            actions.push({
              ticketNumber: update.ticketNumber,
              ticketId: ticket.ticketId,
              type: "email_draft",
              description: `Draft client email for ${ticket.clientName || "client"}`,
              data: { summary: update.summary },
            });
            break;

          case "done_no_action":
            // No action needed
            break;
        }
      }

      return { actions, vagueTickets };
    } catch (err) {
      console.error("[eod-reply] Failed to parse reply:", err);
      return null;
    }
  }

  /**
   * Extract dates from a clarity response using Claude.
   */
  private async extractDates(
    text: string,
    ticketNumbers: string[]
  ): Promise<Record<string, string> | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const todayStr = new Date().toISOString().split("T")[0];
    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

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
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `Today is ${dayOfWeek}, ${todayStr}. A team member was asked when they'll finish these tickets: ${ticketNumbers.join(", ")}.

Their response: "${text}"

Extract the completion date for each ticket. If the same date applies to all tickets, apply it to all.
Resolve relative dates: "Tuesday" = upcoming Tuesday, "end of week" = this Friday, "tomorrow" = next day.

Return ONLY JSON (no fences): { "CHQ-XXX": "YYYY-MM-DD", ... }
Only include tickets where a date was mentioned or implied.`,
          }],
        }),
      });

      if (!res.ok) return null;
      const responseData = await res.json();
      const content = responseData.content?.[0]?.text?.trim();
      if (!content) return null;

      const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  /**
   * Generate an email draft using the Choquer voice framework.
   */
  private async generateEmailDraft(
    ticket: TicketContext,
    additionalContext: string,
    senderName: string
  ): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    // Load email voice framework
    let emailVoice = "";
    try {
      const fs = await import("fs");
      const path = await import("path");
      const promptPath = path.join(process.cwd(), "lib", "slack-assistant", "prompts", "email-voice.md");
      emailVoice = fs.readFileSync(promptPath, "utf-8");
    } catch {
      emailVoice = "Write in a warm, professional tone. Use 'Hey [Name],' as greeting and 'Cheers, [Sender]' as sign-off.";
    }

    // Get ticket details for context
    const convex = getConvexClient();
    let ticketDetails = "";
    try {
      const ticketDoc = await convex.query(api.tickets.getById, { id: ticket.ticketId as any });
      if (ticketDoc) {
        ticketDetails = `Ticket: ${ticket.ticketNumber} — ${ticket.title}\nDescription: ${(ticketDoc as any).description || "No description"}\nStatus: ${(ticketDoc as any).status}`;
      }
    } catch {
      ticketDetails = `Ticket: ${ticket.ticketNumber} — ${ticket.title}`;
    }

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
          max_tokens: 1000,
          system: emailVoice,
          messages: [{
            role: "user",
            content: `Draft a client email for this situation:

Client: ${ticket.clientName || "the client"}
${ticketDetails}

Team member sending: ${senderName.split(" ")[0]}
Additional context from the team member: "${additionalContext}"

Write a complete email following the voice guidelines. Use [Client Name] as placeholder for the client's first name.
End with:
Cheers,
${senderName.split(" ")[0]}`,
          }],
        }),
      });

      if (!res.ok) return null;
      const responseData = await res.json();
      return responseData.content?.[0]?.text?.trim() || null;
    } catch {
      return null;
    }
  }

  private formatActions(actions: ProposedAction[]): string {
    return actions.map((a) => {
      switch (a.type) {
        case "status_change":
          return `• *${a.ticketNumber}*: ${a.description}`;
        case "blocker":
          return `• *${a.ticketNumber}*: ${a.description}`;
        case "commitment":
          return `• *${a.ticketNumber}*: ${a.description}`;
        case "email_draft":
          return `• *${a.ticketNumber}*: ${a.description} — I can draft this for you. Want me to? Reply with any context you'd like included.`;
        case "comment":
          return `• *${a.ticketNumber}*: Add comment`;
        default:
          return `• *${a.ticketNumber}*: ${a.description}`;
      }
    }).join("\n");
  }
}
