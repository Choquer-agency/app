import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

function createServer() {
  const server = new McpServer({
    name: "choquer",
    version: "1.0.0",
  });

  // --- Portal data tools ---

  server.tool(
    "list_clients",
    "List all clients in the Choquer portal with their status, MRR, and integrations",
    { status: z.string().optional().describe("Filter: active, new, offboarding, inactive") },
    async ({ status }) => {
      const convex = getConvexClient();
      const clients = await convex.query(api.clients.list, {} as any);
      let filtered = clients as any[];
      if (status) filtered = filtered.filter((c: any) => c.clientStatus === status);
      const data = filtered.map((c: any) => ({
        name: c.name,
        slug: c.slug,
        status: c.clientStatus || "active",
        website: c.websiteUrl || null,
        mrr: c.mrr || 0,
        industry: c.industry || null,
        contactName: c.contactName || null,
        contactEmail: c.contactEmail || null,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "list_tickets",
    "List tickets from the Choquer portal. Filter by status or priority.",
    {
      status: z.string().optional().describe("Filter: needs_attention, in_progress, complete"),
      priority: z.string().optional().describe("Filter: low, normal, high, urgent"),
      limit: z.number().optional().describe("Max tickets (default 50)"),
    },
    async ({ status, priority, limit }) => {
      const convex = getConvexClient();
      const args: Record<string, unknown> = { limit: limit || 50 };
      if (status) args.status = [status];
      if (priority) args.priority = [priority];
      const tickets = await convex.query(api.tickets.list, args as any);
      const data = (tickets as any[]).map((t: any) => ({
        ticketNumber: t.ticketNumber,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate || null,
        clientName: t.clientName || null,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "list_projects",
    "List all active projects with status and ticket progress",
    {},
    async () => {
      const convex = getConvexClient();
      const projects = await convex.query(api.projects.list, {} as any);
      const data = (projects as any[])
        .filter((p: any) => !p.archived && !p.isTemplate)
        .map((p: any) => ({
          name: p.name,
          status: p.status,
          clientName: p.clientName || null,
          ticketCount: p.ticketCount ?? 0,
          completedTicketCount: p.completedTicketCount ?? 0,
        }));
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "list_team_members",
    "List all active team members with their roles",
    {},
    async () => {
      const convex = getConvexClient();
      const members = await convex.query(api.teamMembers.list, {} as any);
      const data = (members as any[])
        .filter((m: any) => m.active !== false)
        .map((m: any) => ({
          name: m.name,
          email: m.email,
          role: m.roleLevel || "employee",
        }));
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "list_connections",
    "List all API connections configured in the portal (Stripe, Airtable, etc.)",
    {},
    async () => {
      const convex = getConvexClient();
      const connections = await convex.query(api.apiConnections.list, {} as any);
      const data = (connections as any[]).map((c: any) => ({
        platform: c.platform,
        scope: c.scope,
        status: c.status,
        displayName: c.displayName || null,
        lastVerifiedAt: c.lastVerifiedAt || null,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

// Stateless: create new transport per request
async function handleMcpRequest(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  const server = createServer();
  await server.connect(transport);
  const response = await transport.handleRequest(req);
  return response;
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
