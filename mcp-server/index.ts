#!/usr/bin/env npx tsx
/**
 * Choquer MCP Server — exposes portal data and connected platforms to Claude Desktop.
 *
 * Usage:
 *   npx tsx mcp-server/index.ts
 *
 * Env vars required:
 *   NEXT_PUBLIC_CONVEX_URL   — Convex deployment URL
 *   CREDENTIALS_ENCRYPTION_KEY — 64-char hex for decrypting stored API keys
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getPortalTools } from "./tools/portal-data.js";
import { getStripeTools } from "./tools/stripe.js";
import { getAirtableTools } from "./tools/airtable.js";

const server = new McpServer({
  name: "choquer",
  version: "1.0.0",
});

// Register all tools
const allToolSets = [
  getPortalTools(),
  getStripeTools(),
  getAirtableTools(),
];

for (const tools of allToolSets) {
  for (const tool of tools) {
    // Convert JSON Schema properties to zod shape for MCP SDK
    const properties = (tool.inputSchema as any).properties || {};
    const required = (tool.inputSchema as any).required || [];
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, schema] of Object.entries(properties)) {
      const s = schema as any;
      let zodType: z.ZodTypeAny;
      if (s.type === "number") zodType = z.number().describe(s.description || "");
      else if (s.type === "boolean") zodType = z.boolean().describe(s.description || "");
      else zodType = z.string().describe(s.description || "");

      shape[key] = required.includes(key) ? zodType : zodType.optional();
    }

    server.tool(
      tool.name,
      tool.description,
      shape,
      async (args) => {
        try {
          const result = await tool.handler(args as Record<string, unknown>);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      }
    );
  }
}

// Start stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Choquer MCP server running — ${allToolSets.flat().length} tools registered`);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
