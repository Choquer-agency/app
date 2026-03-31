/**
 * MCP tools for Stripe — revenue, subscriptions, invoices.
 * Requires an active "stripe" connection in apiConnections.
 */

import { listConnections } from "../lib/convex-client.js";
import { decryptCredentials } from "../lib/credentials.js";

async function getStripeKey(): Promise<string | null> {
  const connections = await listConnections("org");
  const stripe = (connections as any[]).find(
    (c: any) => c.platform === "stripe" && c.status === "active"
  );
  if (!stripe) return null;
  const creds = decryptCredentials(stripe.encryptedCreds, stripe.credsIv);
  return creds.apiKey;
}

async function stripeGet(path: string, params?: Record<string, string>): Promise<any> {
  const key = await getStripeKey();
  if (!key) throw new Error("Stripe is not connected. Go to Settings > Connections to add your Stripe API key.");
  const url = new URL(`https://api.stripe.com/v1${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Stripe API error: ${res.status}`);
  }
  return res.json();
}

export function getStripeTools() {
  return [
    {
      name: "stripe_get_balance",
      description: "Get the current Stripe account balance (available and pending funds)",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async () => {
        const balance = await stripeGet("/balance");
        return {
          available: balance.available?.map((b: any) => ({
            amount: b.amount / 100,
            currency: b.currency,
          })),
          pending: balance.pending?.map((b: any) => ({
            amount: b.amount / 100,
            currency: b.currency,
          })),
        };
      },
    },
    {
      name: "stripe_list_charges",
      description: "List recent Stripe charges/payments",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: { type: "number", description: "Number of charges to return (default: 20, max: 100)" },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const limit = Math.min((args.limit as number) || 20, 100);
        const data = await stripeGet("/charges", { limit: String(limit) });
        return data.data?.map((c: any) => ({
          id: c.id,
          amount: c.amount / 100,
          currency: c.currency,
          status: c.status,
          description: c.description,
          customerEmail: c.billing_details?.email,
          created: new Date(c.created * 1000).toISOString(),
        }));
      },
    },
    {
      name: "stripe_list_subscriptions",
      description: "List active Stripe subscriptions",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: { type: "string", description: "Filter: active, past_due, canceled, all (default: active)" },
          limit: { type: "number", description: "Number to return (default: 20)" },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const params: Record<string, string> = {
          limit: String(Math.min((args.limit as number) || 20, 100)),
        };
        if (args.status && args.status !== "all") params.status = args.status as string;
        else params.status = "active";
        const data = await stripeGet("/subscriptions", params);
        return data.data?.map((s: any) => ({
          id: s.id,
          status: s.status,
          customerEmail: s.customer_email,
          monthlyAmount: s.plan?.amount ? s.plan.amount / 100 : null,
          currency: s.plan?.currency,
          currentPeriodEnd: new Date(s.current_period_end * 1000).toISOString(),
          created: new Date(s.created * 1000).toISOString(),
        }));
      },
    },
    {
      name: "stripe_list_invoices",
      description: "List recent Stripe invoices",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: { type: "string", description: "Filter: draft, open, paid, void, uncollectible" },
          limit: { type: "number", description: "Number to return (default: 20)" },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const params: Record<string, string> = {
          limit: String(Math.min((args.limit as number) || 20, 100)),
        };
        if (args.status) params.status = args.status as string;
        const data = await stripeGet("/invoices", params);
        return data.data?.map((i: any) => ({
          id: i.id,
          number: i.number,
          status: i.status,
          total: i.total / 100,
          currency: i.currency,
          customerEmail: i.customer_email,
          dueDate: i.due_date ? new Date(i.due_date * 1000).toISOString() : null,
          created: new Date(i.created * 1000).toISOString(),
        }));
      },
    },
  ];
}
