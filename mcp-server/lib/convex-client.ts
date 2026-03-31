import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
    client = new ConvexHttpClient(url);
  }
  return client;
}

export async function listConnections(scope?: string) {
  const c = getClient();
  const args: Record<string, string> = {};
  if (scope) args.scope = scope;
  return await c.query(api.apiConnections.list, args as any);
}

export async function getConnectionById(id: string) {
  const c = getClient();
  return await c.query(api.apiConnections.getById, { id: id as any });
}

export async function listClients() {
  const c = getClient();
  return await c.query(api.clients.list, {} as any);
}

export async function listTickets(args?: Record<string, unknown>) {
  const c = getClient();
  return await c.query(api.tickets.list, (args || {}) as any);
}

export async function listProjects() {
  const c = getClient();
  return await c.query(api.projects.list, {} as any);
}

export async function listTeamMembers() {
  const c = getClient();
  return await c.query(api.teamMembers.list, {} as any);
}
