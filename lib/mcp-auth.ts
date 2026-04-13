import { createHash, timingSafeEqual } from "crypto";
import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";
import type { RoleLevel } from "./permissions";

export interface McpCaller {
  tokenId: string;
  teamMemberId: string;
  teamMemberName: string;
  roleLevel: RoleLevel;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verifies the bearer token on an MCP request.
 * Returns the caller profile, or a Response to short-circuit.
 *
 * Accepts two shapes:
 * 1. Per-user token stored in mcpTokens (preferred)
 * 2. Legacy shared MCP_BEARER_TOKEN env var (fallback; no teamMemberId)
 */
export async function authenticateMcpRequest(
  request: Request
): Promise<{ caller: McpCaller | null } | { response: Response }> {
  // Accept token from Authorization header OR ?token= query param (for MCP
  // clients like Claude Desktop that don't support custom headers).
  const header = request.headers.get("authorization") ?? "";
  let provided = "";
  if (header.startsWith("Bearer ")) {
    provided = header.slice("Bearer ".length).trim();
  } else {
    try {
      const url = new URL(request.url);
      provided = (url.searchParams.get("token") || "").trim();
    } catch {}
  }
  if (!provided) return { response: unauthorized() };

  // Legacy shared token — keeps old connectors working during rollout.
  const legacy = process.env.MCP_BEARER_TOKEN;
  if (legacy && constantTimeEq(provided, legacy)) {
    return { caller: null };
  }

  // Per-user token lookup via hash.
  const convex = getConvexClient();
  const tokenHash = hashToken(provided);
  const result = await convex.query(api.mcpTokens.verifyByHash, { tokenHash });
  if (!result) return { response: unauthorized() };

  // Fire-and-forget lastUsedAt update (don't block the request).
  convex
    .mutation(api.mcpTokens.markUsed, { id: result.tokenId as any })
    .catch(() => {});

  return {
    caller: {
      tokenId: String(result.tokenId),
      teamMemberId: String(result.teamMemberId),
      teamMemberName: result.teamMemberName,
      roleLevel: result.roleLevel as RoleLevel,
    },
  };
}

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="choquer-mcp"',
    },
  });
}

// Kept for backwards compatibility. Accepts bearer header OR ?token= param.
export function verifyMcpBearer(request: Request): Response | null {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) return null;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token")) return null;
  } catch {}
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="choquer-mcp"',
    },
  });
}
