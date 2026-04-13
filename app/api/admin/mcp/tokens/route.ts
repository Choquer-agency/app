import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { hashToken } from "@/lib/mcp-auth";
import { encryptCredentials, decryptCredentials } from "@/lib/credentials-crypto";

export const runtime = "nodejs";

async function provisionToken(teamMemberId: string) {
  const convex = getConvexClient();
  const plaintext = `chq_${randomBytes(32).toString("hex")}`;
  const tokenHash = hashToken(plaintext);
  const { ciphertext, iv } = encryptCredentials(plaintext);
  await convex.mutation(api.mcpTokens.create, {
    teamMemberId: teamMemberId as any,
    tokenHash,
    encryptedToken: ciphertext,
    tokenIv: iv,
  });
  return plaintext;
}

// GET — returns the user's single active token (auto-provisions if none exists).
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const convex = getConvexClient();
  let primary = await convex.query(api.mcpTokens.getPrimary, {
    teamMemberId: session.teamMemberId as any,
  });

  let plaintext: string | null = null;
  if (!primary) {
    plaintext = await provisionToken(session.teamMemberId);
  } else if (primary.encryptedToken && primary.tokenIv) {
    try {
      plaintext = decryptCredentials(primary.encryptedToken, primary.tokenIv);
    } catch {
      plaintext = null;
    }
  }

  // Legacy token row with no encrypted plaintext (created before this change) —
  // auto-rotate so the user gets a copyable URL.
  if (!plaintext) {
    await convex.mutation(api.mcpTokens.revokeAllForTeamMember, {
      teamMemberId: session.teamMemberId as any,
    });
    plaintext = await provisionToken(session.teamMemberId);
    primary = await convex.query(api.mcpTokens.getPrimary, {
      teamMemberId: session.teamMemberId as any,
    });
  }

  return NextResponse.json({
    token: plaintext,
    createdAt: primary?.createdAt,
    lastUsedAt: primary?.lastUsedAt,
  });
}

// POST — rotate (revoke current, issue new).
export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const convex = getConvexClient();
  await convex.mutation(api.mcpTokens.revokeAllForTeamMember, {
    teamMemberId: session.teamMemberId as any,
  });
  const plaintext = await provisionToken(session.teamMemberId);

  return NextResponse.json({ token: plaintext });
}
