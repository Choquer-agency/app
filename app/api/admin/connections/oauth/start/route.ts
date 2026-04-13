import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { googleAuthUrl } from "../providers/google";
import { signState } from "../state";

export const runtime = "nodejs";

function redirectUri(request: NextRequest): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${origin}/api/admin/connections/oauth/callback`;
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.roleLevel, "connections:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const scope = (searchParams.get("scope") || "org") as "org" | "client";
  const clientId = searchParams.get("clientId") || undefined;

  if (!platform) {
    return NextResponse.json({ error: "platform is required" }, { status: 400 });
  }

  const state = signState({
    platform,
    scope,
    clientId,
    teamMemberId: session.teamMemberId,
  });

  if (platform === "google_oauth" || platform === "google_ads" || platform === "youtube") {
    const clientIdEnv = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientIdEnv) {
      return NextResponse.json(
        { error: "GOOGLE_OAUTH_CLIENT_ID is not configured" },
        { status: 500 }
      );
    }
    const url = googleAuthUrl({
      clientId: clientIdEnv,
      redirectUri: redirectUri(request),
      state,
    });
    return NextResponse.redirect(url);
  }

  return NextResponse.json(
    { error: `OAuth not yet implemented for platform: ${platform}` },
    { status: 400 }
  );
}
