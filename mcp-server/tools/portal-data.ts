/**
 * MCP tools for querying portal data (clients, tickets, projects, team).
 * These work without any API connections — they read directly from Convex.
 */

import { listClients, listTickets, listProjects, listTeamMembers } from "../lib/convex-client.js";

export function getPortalTools() {
  return [
    {
      name: "list_clients",
      description: "List all clients in the Choquer portal with their status, MRR, and connected integrations",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            description: "Filter by client status: active, new, offboarding, inactive",
          },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const clients = await listClients();
        let filtered = clients as any[];
        if (args.status) {
          filtered = filtered.filter((c: any) => c.clientStatus === args.status);
        }
        return filtered.map((c: any) => ({
          name: c.name,
          slug: c.slug,
          status: c.clientStatus || "active",
          website: c.websiteUrl || null,
          mrr: c.mrr || 0,
          industry: c.industry || null,
          contactName: c.contactName || null,
          contactEmail: c.contactEmail || null,
          integrations: {
            ga4: !!c.ga4PropertyId,
            gsc: !!c.gscSiteUrl,
            seRankings: !!c.seRankingsProjectId,
            notion: !!c.notionPageUrl,
          },
        }));
      },
    },
    {
      name: "list_tickets",
      description: "List tickets from the Choquer portal. Can filter by status, priority, or show archived tickets.",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            description: "Filter by status: needs_attention, in_progress, complete",
          },
          priority: {
            type: "string",
            description: "Filter by priority: low, normal, high, urgent",
          },
          archived: {
            type: "boolean",
            description: "Show archived tickets (default: false)",
          },
          limit: {
            type: "number",
            description: "Max tickets to return (default: 50)",
          },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const queryArgs: Record<string, unknown> = {
          limit: (args.limit as number) || 50,
        };
        if (args.archived) queryArgs.archived = true;
        if (args.status) queryArgs.status = [args.status as string];
        if (args.priority) queryArgs.priority = [args.priority as string];

        const tickets = await listTickets(queryArgs);
        return (tickets as any[]).map((t: any) => ({
          ticketNumber: t.ticketNumber,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate || null,
          clientName: t.clientName || null,
          createdAt: t._creationTime ? new Date(t._creationTime).toISOString() : null,
        }));
      },
    },
    {
      name: "list_projects",
      description: "List all projects in the Choquer portal with their status and ticket counts",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
      handler: async () => {
        const projects = await listProjects();
        return (projects as any[])
          .filter((p: any) => !p.archived && !p.isTemplate)
          .map((p: any) => ({
            name: p.name,
            status: p.status,
            clientName: p.clientName || null,
            ticketCount: p.ticketCount ?? 0,
            completedTicketCount: p.completedTicketCount ?? 0,
            startDate: p.startDate || null,
            endDate: p.endDate || null,
          }));
      },
    },
    {
      name: "list_team_members",
      description: "List all team members in the Choquer agency with their roles and status",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
      handler: async () => {
        const members = await listTeamMembers();
        return (members as any[])
          .filter((m: any) => m.active !== false)
          .map((m: any) => ({
            name: m.name,
            email: m.email,
            role: m.roleLevel || "employee",
            employeeStatus: m.employeeStatus || null,
          }));
      },
    },
  ];
}
