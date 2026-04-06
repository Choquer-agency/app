import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { decryptCredentials } from "@/lib/credentials-crypto";

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

  // --- Helper to get decrypted API key for a platform ---
  async function getPlatformApiKey(platform: string): Promise<string> {
    const convex = getConvexClient();
    const connections = await convex.query(api.apiConnections.list, { scope: "org" } as any);
    const conn = (connections as any[]).find(
      (c: any) => c.platform === platform && c.status === "active"
    );
    if (!conn) throw new Error(`${platform} is not connected. Go to Settings > Connections to add it.`);
    const raw = decryptCredentials(conn.encryptedCreds, conn.credsIv);
    const creds = JSON.parse(raw);
    if (!creds.apiKey) throw new Error(`${platform} credentials missing apiKey`);
    return creds.apiKey.trim();
  }

  // --- MailerLite tools ---

  server.tool(
    "mailerlite_list_campaigns",
    "List recent MailerLite email campaigns with their stats (open rate, click rate, sent count)",
    {
      status: z.string().optional().describe("Filter: sent, draft, ready (default: sent)"),
      limit: z.number().optional().describe("Number of campaigns to return (default: 10)"),
    },
    async ({ status, limit }) => {
      const key = await getPlatformApiKey("mailerlite");
      const params = new URLSearchParams({
        "filter[status]": status || "sent",
        limit: String(limit || 10),
        sort: "-created_at",
      });
      const res = await fetch(`https://connect.mailerlite.com/api/campaigns?${params}`, {
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`MailerLite API error: ${res.status}`);
      const body = await res.json();
      const data = body.data?.map((c: any) => ({
        name: c.name,
        subject: c.emails?.[0]?.subject || c.name,
        status: c.status,
        type: c.type,
        sentAt: c.scheduled_for || c.created_at,
        stats: {
          sent: c.stats?.sent || 0,
          opens: c.stats?.opens_count || 0,
          openRate: c.stats?.sent ? `${((c.stats.opens_count / c.stats.sent) * 100).toFixed(1)}%` : "N/A",
          clicks: c.stats?.clicks_count || 0,
          clickRate: c.stats?.sent ? `${((c.stats.clicks_count / c.stats.sent) * 100).toFixed(1)}%` : "N/A",
          unsubscribes: c.stats?.unsubscribes_count || 0,
          bounces: c.stats?.hard_bounces_count || 0,
        },
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "mailerlite_get_subscribers_count",
    "Get the total number of MailerLite subscribers and a breakdown by status",
    {},
    async () => {
      const key = await getPlatformApiKey("mailerlite");
      const res = await fetch("https://connect.mailerlite.com/api/subscribers?limit=0", {
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`MailerLite API error: ${res.status}`);
      const body = await res.json();
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ total: body.total || 0 }, null, 2) }],
      };
    }
  );

  server.tool(
    "mailerlite_list_subscribers",
    "List MailerLite subscribers with their email, name, and status",
    {
      status: z.string().optional().describe("Filter: active, unsubscribed, unconfirmed, bounced, junk"),
      limit: z.number().optional().describe("Number of subscribers (default: 20)"),
    },
    async ({ status, limit }) => {
      const key = await getPlatformApiKey("mailerlite");
      const params = new URLSearchParams({ limit: String(limit || 20) });
      if (status) params.set("filter[status]", status);
      const res = await fetch(`https://connect.mailerlite.com/api/subscribers?${params}`, {
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`MailerLite API error: ${res.status}`);
      const body = await res.json();
      const data = body.data?.map((s: any) => ({
        email: s.email,
        name: `${s.fields?.name || ""} ${s.fields?.last_name || ""}`.trim() || null,
        status: s.status,
        subscribedAt: s.subscribed_at,
        openRate: s.stats?.open_rate ? `${(s.stats.open_rate * 100).toFixed(1)}%` : null,
        clickRate: s.stats?.click_rate ? `${(s.stats.click_rate * 100).toFixed(1)}%` : null,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // --- Stripe tools ---

  server.tool(
    "stripe_get_balance",
    "Get the current Stripe account balance",
    {},
    async () => {
      const key = await getPlatformApiKey("stripe");
      const res = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`Stripe API error: ${res.status}`);
      const balance = await res.json();
      const data = {
        available: balance.available?.map((b: any) => ({ amount: b.amount / 100, currency: b.currency })),
        pending: balance.pending?.map((b: any) => ({ amount: b.amount / 100, currency: b.currency })),
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "stripe_list_invoices",
    "List recent Stripe invoices",
    {
      status: z.string().optional().describe("Filter: draft, open, paid, void"),
      limit: z.number().optional().describe("Number to return (default: 20)"),
    },
    async ({ status, limit }) => {
      const key = await getPlatformApiKey("stripe");
      const params = new URLSearchParams({ limit: String(Math.min(limit || 20, 100)) });
      if (status) params.set("status", status);
      const res = await fetch(`https://api.stripe.com/v1/invoices?${params}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`Stripe error: ${res.status}`);
      const body = await res.json();
      const data = body.data?.map((i: any) => ({
        number: i.number,
        status: i.status,
        total: i.total / 100,
        currency: i.currency,
        customerEmail: i.customer_email,
        created: new Date(i.created * 1000).toISOString(),
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
    enableJsonResponse: true,
  });
  const server = createServer();
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(req);
    return response;
  } catch (err) {
    console.error("MCP request error:", err);
    return new Response(JSON.stringify({ error: "MCP error" }), { status: 500 });
  }
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
