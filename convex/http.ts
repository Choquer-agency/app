import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Meta Lead Ads webhook — GET verification handshake.
 * Meta sends `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` once when
 * you subscribe the webhook. We echo the challenge iff the verify_token matches
 * what Andreas configured in Settings → Meta Ads.
 */
http.route({
  path: "/webhooks/meta/lead-ads",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const config = await ctx.runQuery(internal.metaConfig.getRowInternal, {});
    const expected = config?.verifyToken;
    if (mode === "subscribe" && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response(JSON.stringify({ error: "verification_failed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/**
 * Meta Lead Ads webhook — POST. Meta sends leadgen events. We pass the raw body
 * and signature to a Node-runtime internal action which HMAC-verifies the payload
 * (needs the decrypted App Secret), fetches the full lead data from Graph API,
 * and creates the lead in Convex.
 *
 * We respond 200 quickly regardless of processing outcome — Meta will disable
 * subscriptions that 5xx too often. Processing errors are logged server-side.
 */
http.route({
  path: "/webhooks/meta/lead-ads",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256") ?? "";
    const clientIpAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    const clientUserAgent = req.headers.get("user-agent") || undefined;

    // Fire-and-forget isn't available from httpAction — but we can await briefly
    // since Meta allows a few seconds. We still always return 200.
    try {
      const result = await ctx.runAction(internal.leadsMeta.processLeadgenWebhook, {
        rawBody,
        signature,
        clientIpAddress,
        clientUserAgent,
      });
      if (!result.ok && result.error === "invalid_signature") {
        // Signature mismatch means this request didn't come from Meta — 401.
        return new Response(JSON.stringify({ error: "invalid_signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("[meta-webhook] processing error", err);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
