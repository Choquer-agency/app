import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { decryptCredentials } from "@/lib/credentials-crypto";
import { authenticateMcpRequest, type McpCaller } from "@/lib/mcp-auth";
import { isToolAllowed } from "@/lib/mcp-tools-rbac";
import {
  marketingQuery,
  marketingDiscover,
  clientConnections,
  marketingCompare,
  marketingReport,
  resolveClientOrThrow,
} from "@/lib/marketing/mcp-tools";
import { executeSyncJob } from "@/lib/sync/run";

export const runtime = "nodejs";
export const maxDuration = 60;

const dateRangeSchema = z.union([
  z.object({
    preset: z.enum([
      "today",
      "yesterday",
      "last_7_days",
      "last_14_days",
      "last_28_days",
      "last_30_days",
      "last_90_days",
      "last_12_months",
      "mtd",
      "qtd",
      "ytd",
      "last_week",
      "last_month",
      "last_quarter",
      "last_year",
    ]),
  }),
  z.object({
    start: z.string().describe("YYYY-MM-DD"),
    end: z.string().describe("YYYY-MM-DD"),
  }),
]);

const filterSchema = z.object({
  dimension: z.string(),
  op: z.enum(["eq", "contains"]),
  value: z.string(),
});

const sortSchema = z.object({
  metric: z.string(),
  direction: z.enum(["asc", "desc"]),
});

const platformEnum = z.enum(["ga4", "gsc", "google_ads", "youtube", "gbp", "pagespeed"]);

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

async function logAudit(
  caller: McpCaller | null,
  tool: string,
  args: unknown,
  success: boolean,
  durationMs: number,
  errorMessage?: string
) {
  try {
    const convex = getConvexClient();
    const detail = JSON.stringify({
      tool,
      args,
      error: errorMessage,
      callerName: caller?.teamMemberName ?? "legacy",
    });
    await convex.mutation(api.mcpAuditLog?.create ?? ({} as any), {
      actor: caller?.teamMemberId ?? "mcp:legacy",
      detail,
      teamMemberId: caller ? (caller.teamMemberId as any) : undefined,
      tool,
      success,
      durationMs,
    });
  } catch {
    // audit must never block a tool call
  }
}

type ToolHandler = (args: Record<string, any>) => Promise<{
  content: { type: "text"; text: string }[];
  isError?: boolean;
}>;

function wrapTool(
  caller: McpCaller | null,
  toolName: string,
  handler: ToolHandler
): ToolHandler {
  return async (args) => {
    if (!isToolAllowed(toolName, caller?.roleLevel ?? null)) {
      const msg = `Tool "${toolName}" is not available for role ${caller?.roleLevel ?? "unknown"}.`;
      await logAudit(caller, toolName, args, false, 0, msg);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
        isError: true,
      };
    }
    const started = Date.now();
    try {
      const result = await handler(args);
      await logAudit(caller, toolName, args, !result.isError, Date.now() - started);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logAudit(caller, toolName, args, false, Date.now() - started, message);
      return errorContent(err);
    }
  };
}

function createServer(caller: McpCaller | null) {
  const server = new McpServer({
    name: "choquer",
    version: "1.0.0",
  });

  const register = (
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    handler: ToolHandler
  ) => {
    // Skip tools the caller can't use so they don't even see them in tools/list.
    if (!isToolAllowed(name, caller?.roleLevel ?? null)) return;
    server.tool(name, description, schema, wrapTool(caller, name, handler) as any);
  };

  // --- Portal data tools ---

  register(
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
      return jsonContent(data);
    }
  );

  register(
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
      return jsonContent(data);
    }
  );

  register(
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
      return jsonContent(data);
    }
  );

  register(
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
      return jsonContent(data);
    }
  );

  register(
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
      return jsonContent(data);
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

  register(
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
      return jsonContent(data);
    }
  );

  register(
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
      return jsonContent({ total: body.total || 0 });
    }
  );

  register(
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
      return jsonContent(data);
    }
  );

  // --- Stripe tools ---

  register(
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
      return jsonContent(data);
    }
  );

  register(
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
      return jsonContent(data);
    }
  );

  // --- Marketing data tools ---

  register(
    "marketing_query",
    "Pull any metric for any client from any connected marketing platform. Use marketing_discover first to see available metrics/dimensions for each platform.",
    {
      clientName: z.string().describe("Client name (fuzzy matched against the Choquer client list)"),
      platform: platformEnum.describe("ga4 | gsc | google_ads | youtube | gbp | pagespeed"),
      metrics: z.array(z.string()).describe("Metric names (platform-specific — use marketing_discover)"),
      dateRange: dateRangeSchema.describe("Preset or explicit {start,end} in YYYY-MM-DD"),
      dimensions: z.array(z.string()).optional().describe("Dimensions to break down by"),
      filters: z.array(filterSchema).optional().describe("Filter by dimension values"),
      sort: sortSchema.optional(),
      limit: z.number().optional(),
    },
    async (args) => jsonContent(await marketingQuery(args as any))
  );

  register(
    "marketing_discover",
    "List available metrics and dimensions for a marketing platform.",
    { platform: platformEnum },
    async ({ platform }) => jsonContent(marketingDiscover(platform as any))
  );

  register(
    "client_connections",
    "Show which marketing platforms are connected for a specific client, with their IDs.",
    { clientName: z.string() },
    async ({ clientName }) => jsonContent(await clientConnections(clientName as any))
  );

  register(
    "marketing_compare",
    "Compare the same metrics across two periods for a client on one platform. Returns both periods plus deltas.",
    {
      clientName: z.string(),
      platform: platformEnum,
      metrics: z.array(z.string()),
      periodA: dateRangeSchema.describe("First period (typically the more recent one)"),
      periodB: dateRangeSchema.describe("Second period (typically the earlier baseline)"),
      dimensions: z.array(z.string()).optional(),
      filters: z.array(filterSchema).optional(),
    },
    async (args) => jsonContent(await marketingCompare(args as any))
  );

  register(
    "marketing_report",
    "Pull a cross-platform overview for a client for one date range. Each platform returns its key metrics or a 'not connected' message.",
    {
      clientName: z.string(),
      platforms: z.array(platformEnum).describe("Platforms to include"),
      dateRange: dateRangeSchema,
    },
    async (args) => jsonContent(await marketingReport(args as any))
  );

  // --- Sync / ETL tools ---

  register(
    "list_destinations",
    "List configured destinations (Notion databases, Google Sheets, BigQuery tables) that scheduled syncs can deliver to.",
    {},
    async () => {
      const convex = getConvexClient();
      const rows = await convex.query(api.destinations.list, {} as any);
      return jsonContent(
        (rows as any[]).map((d) => ({
          id: d._id,
          name: d.name,
          type: d.type,
          status: d.status,
          lastTestedAt: d.lastTestedAt,
        }))
      );
    }
  );

  register(
    "list_syncs",
    "List scheduled sync jobs. Optionally filter by clientName.",
    {
      clientName: z.string().optional().describe("Filter by client (fuzzy match)"),
      activeOnly: z.boolean().optional(),
    },
    async ({ clientName, activeOnly }) => {
      const convex = getConvexClient();
      let clientId: string | undefined;
      if (clientName) {
        const client = await resolveClientOrThrow(clientName);
        clientId = String(client._id);
      }
      const rows = (await convex.query(api.syncJobs.list, {
        clientId: clientId as any,
        activeOnly,
      } as any)) as any[];
      return jsonContent(
        rows.map((s) => ({
          id: s._id,
          name: s.name,
          sourcePlatform: s.sourcePlatform,
          destinationId: s.destinationId,
          frequency: s.frequency,
          dateRangePreset: s.dateRangePreset,
          metrics: s.metrics,
          dimensions: s.dimensions,
          active: s.active,
          nextRunAt: s.nextRunAt,
          lastRunAt: s.lastRunAt,
        }))
      );
    }
  );

  register(
    "create_sync",
    "Create a scheduled sync that pulls data from a source (GA4, GSC, etc.) on a cadence and pushes to a destination.",
    {
      clientName: z.string(),
      platform: platformEnum,
      destinationName: z.string().describe("Name of the destination as shown in list_destinations"),
      metrics: z.array(z.string()).optional().describe("Override default metrics for the platform"),
      dimensions: z.array(z.string()).optional(),
      dateRangePreset: z
        .enum([
          "yesterday",
          "last_7_days",
          "last_28_days",
          "last_30_days",
          "last_90_days",
          "mtd",
        ])
        .optional()
        .default("last_28_days"),
      frequency: z.enum(["hourly", "daily", "weekly"]).default("daily"),
      hourOfDay: z.number().optional().describe("UTC hour (0-23) for daily/weekly runs"),
      dayOfWeek: z.number().optional().describe("0-6 (Sun=0) for weekly"),
      name: z.string().optional(),
    },
    async (args) => {
      const convex = getConvexClient();
      const client = await resolveClientOrThrow(args.clientName);
      const allDests = (await convex.query(api.destinations.list, {} as any)) as any[];
      const lower = args.destinationName.toLowerCase().trim();
      const dest =
        allDests.find((d) => d.name.toLowerCase() === lower) ||
        allDests.find((d) => d.name.toLowerCase().includes(lower));
      if (!dest) {
        throw new Error(
          `No destination matching "${args.destinationName}". Call list_destinations to see options.`
        );
      }

      const DEFAULT_METRICS: Record<string, string[]> = {
        ga4: ["sessions", "activeUsers", "engagementRate"],
        gsc: ["clicks", "impressions", "ctr", "position"],
        google_ads: ["metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions"],
        youtube: ["views", "estimatedMinutesWatched", "subscribersGained"],
        gbp: [
          "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
          "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
          "WEBSITE_CLICKS",
          "CALL_CLICKS",
        ],
        pagespeed: ["performance", "lcp", "inp", "cls"],
      };
      const DEFAULT_DIMS: Record<string, string[]> = {
        ga4: ["date"],
        gsc: ["date"],
        google_ads: ["segments.date"],
        youtube: ["day"],
        gbp: [],
        pagespeed: [],
      };

      const metrics =
        args.metrics && args.metrics.length > 0
          ? args.metrics
          : DEFAULT_METRICS[args.platform] ?? [];
      const dimensions = args.dimensions ?? DEFAULT_DIMS[args.platform] ?? [];
      const autoName =
        args.name ??
        `${client.name} · ${args.platform} → ${dest.name} (${args.frequency})`;

      const id = await convex.mutation(api.syncJobs.create, {
        name: autoName,
        clientId: client._id as any,
        sourcePlatform: args.platform,
        destinationId: dest._id as any,
        metrics,
        dimensions,
        dateRangePreset: args.dateRangePreset ?? "last_28_days",
        frequency: args.frequency,
        hourOfDay: args.hourOfDay,
        dayOfWeek: args.dayOfWeek,
        nextRunAt: Date.now() + 60 * 1000,
        createdById: (caller?.teamMemberId ?? undefined) as any,
      } as any);
      return jsonContent({
        id,
        name: autoName,
        message: `Sync created. First run queued for ~1 minute from now.`,
      });
    }
  );

  register(
    "run_sync_now",
    "Trigger a scheduled sync immediately. Accepts either the sync id or a (fuzzy) name.",
    {
      syncName: z.string().optional(),
      syncId: z.string().optional(),
    },
    async ({ syncName, syncId }) => {
      const convex = getConvexClient();
      let targetId = syncId;
      if (!targetId && syncName) {
        const all = (await convex.query(api.syncJobs.list, {} as any)) as any[];
        const lower = syncName.toLowerCase().trim();
        const match =
          all.find((s) => s.name.toLowerCase() === lower) ||
          all.find((s) => s.name.toLowerCase().includes(lower));
        if (!match) throw new Error(`No sync matching "${syncName}".`);
        targetId = String(match._id);
      }
      if (!targetId) throw new Error("Provide syncId or syncName.");
      const result = await executeSyncJob(
        targetId as any,
        "mcp",
        (caller?.teamMemberId ?? undefined) as any
      );
      return jsonContent(result);
    }
  );

  register(
    "pause_sync",
    "Pause a scheduled sync so it stops running automatically. Manual Run Now still works.",
    { syncName: z.string().optional(), syncId: z.string().optional() },
    async ({ syncName, syncId }) => {
      const convex = getConvexClient();
      const id = await resolveSyncId(convex, syncName, syncId);
      await convex.mutation(api.syncJobs.update, { id: id as any, active: false });
      return jsonContent({ id, paused: true });
    }
  );

  register(
    "resume_sync",
    "Resume a paused sync so it runs on schedule again.",
    { syncName: z.string().optional(), syncId: z.string().optional() },
    async ({ syncName, syncId }) => {
      const convex = getConvexClient();
      const id = await resolveSyncId(convex, syncName, syncId);
      await convex.mutation(api.syncJobs.update, { id: id as any, active: true });
      return jsonContent({ id, resumed: true });
    }
  );

  register(
    "delete_sync",
    "Permanently delete a scheduled sync. Run history is preserved.",
    { syncName: z.string().optional(), syncId: z.string().optional() },
    async ({ syncName, syncId }) => {
      const convex = getConvexClient();
      const id = await resolveSyncId(convex, syncName, syncId);
      await convex.mutation(api.syncJobs.remove, { id: id as any });
      return jsonContent({ id, deleted: true });
    }
  );

  return server;
}

async function resolveSyncId(
  convex: ReturnType<typeof getConvexClient>,
  syncName?: string,
  syncId?: string
): Promise<string> {
  if (syncId) return syncId;
  if (!syncName) throw new Error("Provide syncId or syncName.");
  const all = (await convex.query(api.syncJobs.list, {} as any)) as any[];
  const lower = syncName.toLowerCase().trim();
  const match =
    all.find((s) => s.name.toLowerCase() === lower) ||
    all.find((s) => s.name.toLowerCase().includes(lower));
  if (!match) throw new Error(`No sync matching "${syncName}".`);
  return String(match._id);
}

async function handleMcpRequest(req: Request, caller: McpCaller | null): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createServer(caller);
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(req);
    return response;
  } catch (err) {
    console.error("MCP request error:", err);
    return new Response(JSON.stringify({ error: "MCP error" }), { status: 500 });
  }
}

async function authAndHandle(request: Request): Promise<Response> {
  const auth = await authenticateMcpRequest(request);
  if ("response" in auth) return auth.response;
  return handleMcpRequest(request, auth.caller);
}

export async function GET(request: Request) {
  return authAndHandle(request);
}

export async function POST(request: Request) {
  return authAndHandle(request);
}

export async function DELETE(request: Request) {
  return authAndHandle(request);
}
