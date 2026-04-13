"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  sendMetaEvent,
  buildDedupEventId,
  type MetaEventName,
} from "../lib/meta-capi";
import type { ResolvedMetaConfig } from "./metaConfigNode";

/**
 * Dispatches a Meta Conversions API event for a given lead.
 *
 * Dedup: if a prior entry for the same eventId exists with status="sent", skips.
 * All attempts (including failures) are recorded on the lead's `metaEventsSent` array.
 *
 * Config is pulled from the metaAdsConfig table (set via the admin settings page).
 */
export const dispatchMetaEvent = internalAction({
  args: {
    leadId: v.id("leads"),
    eventName: v.union(v.literal("Lead"), v.literal("QualifiedLead"), v.literal("Purchase")),
  },
  handler: async (ctx, args) => {
    const lead: Doc<"leads"> | null = await ctx.runQuery(
      internal.leads.getLeadForDispatch,
      { id: args.leadId }
    );
    if (!lead) return { skipped: true, reason: "lead_not_found" };

    const eventName = args.eventName as MetaEventName;
    const eventId = buildDedupEventId(lead._id, eventName);

    // Dedup: don't re-send an event that already succeeded.
    const prior = (lead.metaEventsSent ?? []).find(
      (e) => e.eventId === eventId && e.status === "sent"
    );
    if (prior) return { skipped: true, reason: "already_sent", eventId };

    const config: ResolvedMetaConfig = await ctx.runAction(
      internal.metaConfigNode.getDecryptedInternal,
      {}
    );
    if (!config.configured || !config.enabled || !config.pixelId || !config.accessToken) {
      // Record a soft failure so the UI surfaces it.
      await ctx.runMutation(internal.leads.recordMetaEvent, {
        leadId: lead._id,
        eventName,
        eventId,
        sentAt: Date.now(),
        status: "failed",
        error: !config.configured
          ? "Meta integration not configured yet (Settings → Meta Ads)"
          : !config.enabled
          ? "Meta integration is disabled in settings"
          : "Missing Pixel ID or Access Token in settings",
      });
      return { skipped: true, reason: "not_configured" };
    }

    const result = await sendMetaEvent(
      {
        eventName,
        eventId,
        eventTime: Math.floor(Date.now() / 1000),
        userData: {
          email: lead.contactEmail || undefined,
          phone: lead.contactPhone || undefined,
          fullName: lead.contactName || undefined,
          fbc: lead.fbc || undefined,
          fbp: lead.fbp || undefined,
          clientIpAddress: lead.clientIpAddress || undefined,
          clientUserAgent: lead.clientUserAgent || undefined,
          externalId: lead._id,
        },
        customData: {
          leadStatus: lead.status,
          qualification: lead.qualification,
          value: eventName === "Purchase" ? lead.value : undefined,
          currency: eventName === "Purchase" ? lead.currency || "USD" : undefined,
          leadEventSource: lead.source || undefined,
        },
        actionSource: "system_generated",
      },
      {
        pixelId: config.pixelId,
        accessToken: config.accessToken,
        testEventCode: config.testEventCode,
      }
    );

    await ctx.runMutation(internal.leads.recordMetaEvent, {
      leadId: lead._id,
      eventName,
      eventId,
      sentAt: Date.now(),
      status: result.success ? "sent" : "failed",
      fbTraceId: result.fbTraceId,
      error: result.error,
      testMode: result.testMode,
    });

    return {
      skipped: false,
      success: result.success,
      eventId,
      fbTraceId: result.fbTraceId,
      error: result.error,
      testMode: result.testMode,
    };
  },
});

/**
 * Processes a single Meta Lead Ads webhook leadgen event.
 * Called from the Convex HTTP action (see convex/http.ts) after it receives
 * the POST and verifies the signature.
 *
 * Runs in Node because it uses node:crypto for HMAC verification (done in http.ts
 * via delegating here). Also calls Graph API to pull full lead details.
 */
export const processLeadgenWebhook = internalAction({
  args: {
    // Raw signed body (so this action can independently verify).
    rawBody: v.string(),
    signature: v.string(),
    clientIpAddress: v.optional(v.string()),
    clientUserAgent: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; processed: number; error?: string }> => {
    const config: ResolvedMetaConfig = await ctx.runAction(
      internal.metaConfigNode.getDecryptedInternal,
      {}
    );
    if (!config.configured || !config.appSecret || !config.pageAccessToken) {
      return { ok: false, processed: 0, error: "Webhook config not complete (need App Secret + Page Access Token)" };
    }

    // Verify HMAC-SHA256 signature.
    const crypto = await import("node:crypto");
    const expected =
      "sha256=" + crypto.createHmac("sha256", config.appSecret).update(args.rawBody, "utf8").digest("hex");
    let valid = false;
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(args.signature);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      valid = false;
    }
    if (!valid) {
      return { ok: false, processed: 0, error: "invalid_signature" };
    }

    let payload: any;
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      return { ok: false, processed: 0, error: "invalid_json" };
    }

    if (payload.object !== "page") {
      return { ok: true, processed: 0 };
    }

    const API_VERSION = "v21.0";
    let processed = 0;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const ch = change.value ?? {};
        if (!ch.leadgen_id) continue;

        // Fetch full lead details from Graph API.
        let details: Record<string, string> = {};
        try {
          const url = `https://graph.facebook.com/${API_VERSION}/${ch.leadgen_id}?access_token=${encodeURIComponent(
            config.pageAccessToken
          )}`;
          const res = await fetch(url);
          if (res.ok) {
            const body = await res.json();
            for (const field of body.field_data ?? []) {
              if (field.name && Array.isArray(field.values) && field.values.length > 0) {
                details[String(field.name).toLowerCase()] = String(field.values[0]);
              }
            }
            if (body.ad_id) details.__ad_id = body.ad_id;
            if (body.adset_id) details.__adset_id = body.adset_id;
            if (body.campaign_id) details.__campaign_id = body.campaign_id;
            if (body.form_id) details.__form_id = body.form_id;
            if (body.created_time) details.__created_time = body.created_time;
          } else {
            console.error("[meta-webhook] graph lead fetch failed", res.status, await res.text());
          }
        } catch (err) {
          console.error("[meta-webhook] graph fetch exception", err);
        }

        const pick = (...keys: string[]): string | undefined => {
          for (const k of keys) {
            const v = details[k];
            if (v && v.trim()) return v.trim();
          }
          return undefined;
        };

        const fullName = pick("full_name", "name");
        const email = pick("email");
        const phone = pick("phone_number", "phone");
        const company = pick("company_name", "company") || fullName || "Meta Lead";

        const leadCapturedAt =
          (ch.created_time && ch.created_time * 1000) ||
          (details.__created_time ? Date.parse(details.__created_time) || undefined : undefined) ||
          (entry.time ? entry.time * 1000 : Date.now());

        try {
          await ctx.runMutation(api.leads.createFromMeta, {
            company,
            contactName: fullName,
            contactEmail: email,
            contactPhone: phone,
            meta: {
              metaLeadgenId: ch.leadgen_id,
              metaCampaignId: ch.campaign_id || details.__campaign_id,
              metaAdSetId: ch.adgroup_id || details.__adset_id,
              metaAdId: ch.ad_id || details.__ad_id,
              metaFormId: ch.form_id || details.__form_id,
              metaPageId: ch.page_id || entry.id,
              clientIpAddress: args.clientIpAddress,
              clientUserAgent: args.clientUserAgent,
              leadCapturedAt,
            },
          });
          processed++;
        } catch (err) {
          console.error("[meta-webhook] createFromMeta failed", ch.leadgen_id, err);
        }
      }
    }

    return { ok: true, processed };
  },
});
