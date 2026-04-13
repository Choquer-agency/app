import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { createOAuthConnection } from "@/lib/connections";
import { ConnectionPlatform } from "@/types";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "../providers/google";
import { verifyState } from "../state";

export const runtime = "nodejs";

function redirectUri(request: NextRequest): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${origin}/api/admin/connections/oauth/callback`;
}

function redirectBack(request: NextRequest, status: "ok" | "error", message?: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const back = new URL("/admin/settings/connections", origin);
  back.searchParams.set("oauth", status);
  if (message) back.searchParams.set("message", message);
  return NextResponse.redirect(back);
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) return redirectBack(request, "error", error);
  if (!code || !state) return redirectBack(request, "error", "missing_code_or_state");

  let payload;
  try {
    payload = verifyState(state);
  } catch (e) {
    return redirectBack(request, "error", e instanceof Error ? e.message : "invalid_state");
  }

  if (payload.teamMemberId !== session.teamMemberId) {
    return redirectBack(request, "error", "session_mismatch");
  }

  const platform = payload.platform as ConnectionPlatform;

  if (platform === "google_oauth" || platform === "google_ads" || platform === "youtube") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return redirectBack(request, "error", "google_oauth_not_configured");
    }

    try {
      const tokens = await exchangeGoogleCode({
        code,
        clientId,
        clientSecret,
        redirectUri: redirectUri(request),
      });
      if (!tokens.refresh_token) {
        return redirectBack(request, "error", "no_refresh_token_returned");
      }
      const info = await fetchGoogleUserInfo(tokens.access_token);

      await createOAuthConnection({
        platform,
        scope: payload.scope,
        clientId: payload.clientId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
        accountId: info.sub,
        accountName: info.email,
        addedById: session.teamMemberId,
      });
      return redirectBack(request, "ok");
    } catch (e) {
      console.error("[oauth/callback] Google connection failed:", e);
      return redirectBack(request, "error", e instanceof Error ? e.message : "exchange_failed");
    }
  }

  return redirectBack(request, "error", `unsupported_platform:${platform}`);
}
