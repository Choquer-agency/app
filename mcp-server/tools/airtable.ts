/**
 * MCP tools for Airtable — list bases, search records.
 * Requires an active "airtable" connection in apiConnections.
 */

import { listConnections } from "../lib/convex-client.js";
import { decryptCredentials } from "../lib/credentials.js";

async function getAirtableKey(): Promise<string | null> {
  const connections = await listConnections("org");
  const conn = (connections as any[]).find(
    (c: any) => c.platform === "airtable" && c.status === "active"
  );
  if (!conn) return null;
  const creds = decryptCredentials(conn.encryptedCreds, conn.credsIv);
  return creds.apiKey;
}

async function airtableGet(path: string): Promise<any> {
  const key = await getAirtableKey();
  if (!key) throw new Error("Airtable is not connected. Go to Settings > Connections to add your API key.");
  const res = await fetch(`https://api.airtable.com/v0${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Airtable API error: ${res.status}`);
  return res.json();
}

export function getAirtableTools() {
  return [
    {
      name: "airtable_list_bases",
      description: "List all Airtable bases in the connected workspace",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async () => {
        const data = await airtableGet("/meta/bases");
        return data.bases?.map((b: any) => ({
          id: b.id,
          name: b.name,
          permissionLevel: b.permissionLevel,
        }));
      },
    },
    {
      name: "airtable_list_records",
      description: "List records from an Airtable base and table",
      inputSchema: {
        type: "object" as const,
        properties: {
          baseId: { type: "string", description: "The Airtable base ID (e.g. appXXXXXXX)" },
          tableName: { type: "string", description: "Table name or ID" },
          maxRecords: { type: "number", description: "Max records to return (default: 20)" },
          filterFormula: { type: "string", description: "Airtable formula to filter records (optional)" },
        },
        required: ["baseId", "tableName"],
      },
      handler: async (args: Record<string, unknown>) => {
        const key = await getAirtableKey();
        if (!key) throw new Error("Airtable not connected");

        const url = new URL(`https://api.airtable.com/v0/${args.baseId}/${encodeURIComponent(args.tableName as string)}`);
        url.searchParams.set("maxRecords", String((args.maxRecords as number) || 20));
        if (args.filterFormula) url.searchParams.set("filterByFormula", args.filterFormula as string);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) throw new Error(`Airtable error: ${res.status}`);
        const data = await res.json();
        return data.records?.map((r: any) => ({
          id: r.id,
          fields: r.fields,
          createdTime: r.createdTime,
        }));
      },
    },
  ];
}
