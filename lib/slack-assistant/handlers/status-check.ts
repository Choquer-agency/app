/**
 * ERP Query handler (replaces basic status check).
 * Uses Claude tool-calling to answer ANY question about the business —
 * tickets, team, time tracking, clients, revenue, timesheets, etc.
 */

import { getConvexClient } from "../../convex-server";
import { api } from "@/convex/_generated/api";
import { IntentHandler, HandlerContext, StatusCheckData } from "../types";
import { replyInThread, addSlackReaction } from "@/lib/slack";

// Tool definitions for Claude — each maps to a Convex query
const ERP_TOOLS = [
  {
    name: "list_tickets",
    description: "List tickets with optional filters. Returns ticket number, title, status, priority, assignees, client, due date, created date.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        assigneeId: { type: "string", description: "Filter by assignee team member ID" },
        status: { type: "string", description: "Filter by status: needs_attention, stuck, in_progress, qa_ready, client_review, approved_go_live, closed" },
        archived: { type: "boolean", description: "Include archived tickets (default false)" },
        search: { type: "string", description: "Search by title or ticket number" },
        limit: { type: "number", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "get_ticket_by_number",
    description: "Get a specific ticket by its CHQ number (e.g., CHQ-045). Returns full details including assignees, comments count, sub-tickets.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticketNumber: { type: "string", description: "The ticket number, e.g., CHQ-045" },
      },
      required: ["ticketNumber"],
    },
  },
  {
    name: "list_team_members",
    description: "List all team members with their roles, email, active status, hourly rate, start date.",
    input_schema: {
      type: "object" as const,
      properties: {
        activeOnly: { type: "boolean", description: "Only active members (default true)" },
      },
    },
  },
  {
    name: "list_clients",
    description: "List all clients with their status, MRR (monthly recurring revenue), contract dates, contact info. For accurate MRR totals, use get_revenue_summary instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        includeInactive: { type: "boolean", description: "Include inactive clients" },
      },
    },
  },
  {
    name: "list_client_packages",
    description: "Get all service packages for a specific client — shows what services they pay for, pricing, hours included.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "string", description: "The client ID" },
      },
      required: ["clientId"],
    },
  },
  {
    name: "list_time_entries",
    description: "Get ticket time tracking entries (task-level work logging). Shows who worked on what tickets and for how long.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamMemberId: { type: "string", description: "Filter by team member ID" },
        ticketId: { type: "string", description: "Filter by ticket ID" },
        limit: { type: "number", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "list_timesheet_entries",
    description: "Get payroll clock-in/out timesheet records. Shows when team members clocked in, clocked out, break times, worked hours.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamMemberId: { type: "string", description: "Filter by team member ID" },
        startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
        limit: { type: "number", description: "Max results (default 50)" },
      },
    },
  },
  {
    name: "list_commitments",
    description: "Get ticket commitments (reliability tracking). Shows who committed to finish what by when, and whether they met or missed it.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamMemberId: { type: "string", description: "Filter by team member ID" },
        status: { type: "string", description: "Filter by status: active, met, missed" },
      },
    },
  },
  {
    name: "list_ticket_assignees_for_member",
    description: "Get all ticket assignments for a specific team member.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamMemberId: { type: "string", description: "The team member ID" },
      },
      required: ["teamMemberId"],
    },
  },
  {
    name: "list_vacation_requests",
    description: "Get vacation/time-off requests. Shows dates, status (pending/approved/denied), and who requested.",
    input_schema: {
      type: "object" as const,
      properties: {
        teamMemberId: { type: "string", description: "Filter by team member ID" },
        limit: { type: "number", description: "Max results" },
      },
    },
  },
  {
    name: "list_projects",
    description: "List projects with optional filters. Shows project name, client, status, dates.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        status: { type: "string", description: "Filter: active, completed, on_hold" },
        archived: { type: "boolean", description: "Include archived" },
      },
    },
  },
  {
    name: "list_leads",
    description: "List sales leads. Shows company, contact, status, source.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_revenue_summary",
    description: "Get the agency's revenue summary: total MRR, client count, MRR by client. This is the source of truth for revenue — matches the revenue page exactly.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_client_hours_remaining",
    description: "Get how many hours a client has remaining this month. Calculates: total hours in active packages minus hours logged in time entries this month.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "string", description: "The client ID" },
      },
      required: ["clientId"],
    },
  },
  {
    name: "resolve_name_to_id",
    description: "Resolve a person or client name to their database ID. ALWAYS call this first when you need to filter by team member or client.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "The name to look up" },
        type: { type: "string", enum: ["team_member", "client"], description: "Whether this is a team member or client name" },
      },
      required: ["name", "type"],
    },
  },
];

export class StatusCheckHandler implements IntentHandler {
  async handle(ctx: HandlerContext): Promise<void> {
    const { channelId, messageTs, threadTs, user, messageText, classification } = ctx;
    const replyTs = threadTs || messageTs;

    const answer = await this.queryERP(messageText, user.name);

    if (answer) {
      await replyInThread(channelId, replyTs, answer);
      await addSlackReaction(channelId, replyTs, "mag");
    } else {
      await replyInThread(channelId, replyTs, "I couldn't find an answer to that. Could you rephrase your question?");
    }
  }

  private async queryERP(question: string, userName: string): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Vancouver" });

    // Multi-turn tool-calling loop
    const messages: any[] = [{
      role: "user",
      content: question,
    }];

    const systemPrompt = `You are the Choquer Agency ERP assistant. You have access to the agency's complete business data through tools. Answer questions accurately and concisely.

Today: ${dayOfWeek}, ${todayStr}
Timezone: America/Vancouver (Pacific)
User asking: ${userName}

RULES:
- Use the resolve_name_to_id tool FIRST when you need to filter by a person or client name
- For MRR/revenue questions, use get_revenue_summary — it's the source of truth
- For "hours remaining" questions, use get_client_hours_remaining — it calculates used vs included
- Be specific with numbers and dates — never guess
- Format responses for Slack (use *bold*, bullet points)
- Keep answers concise but complete — don't ask the user if they want more data, just provide it
- If data is empty, say so clearly
- For time/duration questions, convert seconds to hours and minutes
- For money/revenue questions, format as currency with $ and commas
- When listing items, show the most relevant fields (don't dump everything)
- Don't offer follow-up questions — just answer what was asked`;

    try {
      // Allow up to 5 tool-calling rounds
      for (let round = 0; round < 5; round++) {
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
            system: systemPrompt,
            tools: ERP_TOOLS,
            messages,
          }),
        });

        if (!res.ok) {
          console.error("[erp-query] Claude API error:", res.status);
          return null;
        }

        const response = await res.json();

        // If Claude wants to use tools, execute them and continue
        if (response.stop_reason === "tool_use") {
          // Add assistant's response (with tool_use blocks) to messages
          messages.push({ role: "assistant", content: response.content });

          // Execute each tool call
          const toolResults: any[] = [];
          for (const block of response.content) {
            if (block.type === "tool_use") {
              const result = await this.executeTool(block.name, block.input);
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(result),
              });
            }
          }

          // Add tool results to messages
          messages.push({ role: "user", content: toolResults });
          continue;
        }

        // Claude is done — extract the text response
        if (response.stop_reason === "end_turn") {
          const textBlock = response.content?.find((b: any) => b.type === "text");
          return textBlock?.text || null;
        }

        return null;
      }

      return "I needed too many lookups to answer that. Could you ask a more specific question?";
    } catch (err) {
      console.error("[erp-query] Failed:", err);
      return null;
    }
  }

  private async executeTool(name: string, input: Record<string, any>): Promise<any> {
    const convex = getConvexClient();

    try {
      switch (name) {
        case "list_tickets": {
          const args: any = {};
          if (input.clientId) args.clientId = input.clientId;
          if (input.assigneeId) args.assigneeId = input.assigneeId;
          if (input.status) args.status = input.status;
          if (input.archived !== undefined) args.archived = input.archived;
          if (input.search) args.search = input.search;
          args.limit = input.limit || 50;
          const tickets = await convex.query(api.tickets.list, args);
          return (tickets as any[]).map((t: any) => ({
            id: t._id,
            number: t.ticketNumber,
            title: t.title,
            status: t.status,
            priority: t.priority,
            clientName: t.clientName || "Internal",
            dueDate: t.dueDate || null,
            assignees: t.assigneeNames || [],
            createdAt: t._creationTime ? new Date(t._creationTime).toISOString().split("T")[0] : null,
            archived: t.archived || false,
          }));
        }

        case "get_ticket_by_number": {
          const allTickets = await convex.query(api.tickets.list, { search: input.ticketNumber, limit: 10 });
          const match = (allTickets as any[]).find((t: any) =>
            t.ticketNumber?.toUpperCase() === input.ticketNumber?.toUpperCase()
          );
          if (!match) return { error: `Ticket ${input.ticketNumber} not found` };
          const detail = await convex.query(api.tickets.getById, { id: match._id });
          if (!detail) return { error: `Ticket ${input.ticketNumber} not found` };
          return {
            id: (detail as any)._id,
            number: (detail as any).ticketNumber,
            title: (detail as any).title,
            status: (detail as any).status,
            priority: (detail as any).priority,
            description: ((detail as any).description || "").slice(0, 300),
            clientName: (detail as any).clientName || "Internal",
            dueDate: (detail as any).dueDate,
            assignees: (detail as any).assigneeNames || [],
            commentCount: (detail as any).commentCount || 0,
            subTicketCount: (detail as any).subTicketCount || 0,
            createdAt: (detail as any)._creationTime ? new Date((detail as any)._creationTime).toISOString().split("T")[0] : null,
          };
        }

        case "list_team_members": {
          const members = await convex.query(api.teamMembers.list, { activeOnly: input.activeOnly !== false });
          return (members as any[]).map((m: any) => ({
            id: m._id,
            name: m.name,
            email: m.email,
            role: m.role || m.roleLevel,
            active: m.active,
            hourlyRate: m.hourlyRate,
            payType: m.payType,
            startDate: m.startDate,
            availableHoursPerWeek: m.availableHoursPerWeek,
          }));
        }

        case "list_clients": {
          const clients = await convex.query(api.clients.list, { includeInactive: input.includeInactive });
          return (clients as any[]).map((c: any) => ({
            id: c._id,
            name: c.name,
            status: c.clientStatus || "active",
            mrr: c.mrr,
            contactName: c.contactName,
            contactEmail: c.contactEmail,
            industry: c.industry,
            contractStartDate: c.contractStartDate,
            contractEndDate: c.contractEndDate,
            country: c.country,
          }));
        }

        case "list_client_packages": {
          const packages = await convex.query(api.clientPackages.listByClient, { clientId: input.clientId as any });
          return (packages as any[]).map((p: any) => ({
            id: p._id,
            packageName: p.packageName || p.name,
            customPrice: p.customPrice,
            defaultPrice: p.defaultPrice,
            customHours: p.customHours,
            hoursIncluded: p.hoursIncluded,
            active: p.active,
            signupDate: p.signupDate,
          }));
        }

        case "list_time_entries": {
          let entries;
          if (input.teamMemberId) {
            entries = await convex.query(api.timeEntries.listByMember, {
              teamMemberId: input.teamMemberId as any,
              limit: input.limit || 50,
            });
          } else if (input.ticketId) {
            entries = await convex.query(api.timeEntries.listByTicket, {
              ticketId: input.ticketId as any,
              limit: input.limit || 50,
            });
          } else {
            entries = await convex.query(api.timeEntries.listAll, { limit: input.limit || 50 });
          }
          return (entries as any[]).map((e: any) => ({
            id: e._id,
            ticketId: e.ticketId,
            teamMemberId: e.teamMemberId,
            memberName: e.memberName,
            ticketNumber: e.ticketNumber,
            startTime: e.startTime,
            endTime: e.endTime,
            durationSeconds: e.durationSeconds,
            durationHours: e.durationSeconds ? Math.round(e.durationSeconds / 36) / 100 : null,
            note: e.note,
            isManual: e.isManual,
          }));
        }

        case "list_timesheet_entries": {
          let entries;
          if (input.teamMemberId) {
            entries = await convex.query(api.timesheetEntries.listByMember, {
              teamMemberId: input.teamMemberId as any,
              startDate: input.startDate,
              endDate: input.endDate,
              limit: input.limit || 50,
            });
          } else if (input.startDate && input.endDate) {
            entries = await convex.query(api.timesheetEntries.listByDateRange, {
              startDate: input.startDate,
              endDate: input.endDate,
              limit: input.limit || 50,
            });
          } else {
            return { error: "Provide teamMemberId or startDate+endDate" };
          }
          return (entries as any[]).map((e: any) => ({
            id: e._id,
            teamMemberId: e.teamMemberId,
            date: e.date,
            clockInTime: e.clockInTime,
            clockOutTime: e.clockOutTime,
            workedMinutes: e.workedMinutes,
            workedHours: e.workedMinutes ? Math.round(e.workedMinutes / 6) / 10 : null,
            totalBreakMinutes: e.totalBreakMinutes,
            isSickDay: e.isSickDay,
            isVacation: e.isVacation,
            note: e.note,
          }));
        }

        case "list_commitments": {
          let commitments;
          if (input.teamMemberId) {
            commitments = await convex.query(api.commitments.listByMember, {
              teamMemberId: input.teamMemberId as any,
              status: input.status,
            });
          } else if (input.status === "active") {
            commitments = await convex.query(api.commitments.listActive, {});
          } else {
            commitments = await convex.query(api.commitments.listActive, {});
          }
          return (commitments as any[]).map((c: any) => ({
            id: c._id,
            ticketId: c.ticketId,
            teamMemberId: c.teamMemberId,
            committedDate: c.committedDate,
            status: c.status,
            notes: c.notes,
          }));
        }

        case "list_ticket_assignees_for_member": {
          const assignments = await convex.query(api.ticketAssignees.listByMember, {
            teamMemberId: input.teamMemberId as any,
          });
          return assignments;
        }

        case "list_vacation_requests": {
          let requests;
          if (input.teamMemberId) {
            requests = await convex.query(api.vacationRequests.listByMember, {
              teamMemberId: input.teamMemberId as any,
              limit: input.limit || 20,
            });
          } else {
            requests = await convex.query(api.vacationRequests.listAll, { limit: input.limit || 20 });
          }
          return (requests as any[]).map((r: any) => ({
            id: r._id,
            teamMemberId: r.teamMemberId,
            startDate: r.startDate,
            endDate: r.endDate,
            totalDays: r.totalDays,
            status: r.status,
            reason: r.reason,
          }));
        }

        case "list_projects": {
          const args: any = {};
          if (input.clientId) args.clientId = input.clientId;
          if (input.status) args.status = input.status;
          if (input.archived !== undefined) args.archived = input.archived;
          const projects = await convex.query(api.projects.list, args);
          return (projects as any[]).map((p: any) => ({
            id: p._id,
            name: p.name,
            status: p.status,
            clientId: p.clientId,
            startDate: p.startDate,
            dueDate: p.dueDate,
            archived: p.archived,
          }));
        }

        case "list_leads": {
          const leads = await convex.query(api.leads.list, {});
          return (leads as any[]).map((l: any) => ({
            id: l._id,
            company: l.company,
            contactName: l.contactName,
            contactEmail: l.contactEmail,
            status: l.status,
            source: l.source,
            notes: l.notes,
          }));
        }

        case "get_revenue_summary": {
          const clients = await convex.query(api.clients.list, {});
          const activeWithMrr = (clients as any[]).filter((c: any) => (c.mrr || 0) > 0);
          const totalMrr = activeWithMrr.reduce((sum: number, c: any) => sum + (c.mrr || 0), 0);

          // Sort by MRR descending
          const sorted = activeWithMrr
            .sort((a: any, b: any) => (b.mrr || 0) - (a.mrr || 0))
            .map((c: any) => ({ name: c.name, mrr: c.mrr || 0, status: c.clientStatus }));

          return {
            totalMrr: Math.round(totalMrr * 100) / 100,
            activeClientCount: activeWithMrr.length,
            totalClientCount: (clients as any[]).length,
            clientsByMrr: sorted,
          };
        }

        case "get_client_hours_remaining": {
          // Get client packages (hours included)
          const packages = await convex.query(api.clientPackages.listByClient, { clientId: input.clientId as any });
          const activePackages = (packages as any[]).filter((p: any) => p.active);
          const totalHoursIncluded = activePackages.reduce((sum: number, p: any) => {
            return sum + (p.customHours ?? p.hoursIncluded ?? 0);
          }, 0);

          // Get time entries for this client's tickets this month
          const now = new Date();
          const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
          const allTickets = await convex.query(api.tickets.list, { clientId: input.clientId as any, limit: 500 });
          let totalSecondsUsed = 0;
          for (const ticket of (allTickets as any[])) {
            const entries = await convex.query(api.timeEntries.listByTicket, { ticketId: ticket._id, limit: 200 });
            for (const entry of (entries as any[])) {
              if (entry.startTime >= monthStart && entry.durationSeconds) {
                totalSecondsUsed += entry.durationSeconds;
              }
            }
          }

          const hoursUsed = Math.round(totalSecondsUsed / 36) / 100;
          const hoursRemaining = Math.round((totalHoursIncluded - hoursUsed) * 100) / 100;

          return {
            totalHoursIncluded,
            hoursUsedThisMonth: hoursUsed,
            hoursRemaining,
            packages: activePackages.map((p: any) => ({
              name: p.packageName || p.name,
              hours: p.customHours ?? p.hoursIncluded ?? 0,
              price: p.customPrice ?? p.defaultPrice ?? 0,
            })),
            month: monthStart,
          };
        }

        case "resolve_name_to_id": {
          if (input.type === "team_member") {
            const members = await convex.query(api.teamMembers.list, {});
            const match = (members as any[]).find((m: any) =>
              (m.name as string).toLowerCase().includes(input.name.toLowerCase())
            );
            return match
              ? { id: match._id, name: match.name, type: "team_member" }
              : { error: `No team member found matching "${input.name}"` };
          } else {
            const clients = await convex.query(api.clients.list, { includeInactive: true });
            const match = (clients as any[]).find((c: any) =>
              (c.name as string).toLowerCase().includes(input.name.toLowerCase())
            );
            return match
              ? { id: match._id, name: match.name, type: "client" }
              : { error: `No client found matching "${input.name}"` };
          }
        }

        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      console.error(`[erp-query] Tool ${name} failed:`, err);
      return { error: `Tool execution failed: ${err instanceof Error ? err.message : "unknown error"}` };
    }
  }
}
