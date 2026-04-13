"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptCredentials, decryptCredentials } from "../lib/credentials-crypto";
import { sendMetaEvent } from "../lib/meta-capi";

/**
 * Resolved plaintext Meta config used by the CAPI dispatcher + webhook handler.
 * `undefined` secrets mean "not configured yet" — callers must handle that.
 */
export interface ResolvedMetaConfig {
  configured: boolean;
  enabled: boolean;
  pixelId?: string;
  verifyToken?: string;
  testEventCode?: string;
  accessToken?: string;
  appSecret?: string;
  pageAccessToken?: string;
}

/** Internal — returns fully decrypted config for callers in Convex actions. */
export const getDecryptedInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<ResolvedMetaConfig> => {
    const row = await ctx.runQuery(internal.metaConfig.getRowInternal, {});
    if (!row) {
      return { configured: false, enabled: false };
    }
    const decryptField = (f?: { ciphertext: string; iv: string }) => {
      if (!f) return undefined;
      try {
        return decryptCredentials(f.ciphertext, f.iv);
      } catch (err) {
        console.error("[metaConfig] decrypt failed", err);
        return undefined;
      }
    };
    return {
      configured: true,
      enabled: row.enabled,
      pixelId: row.pixelId,
      verifyToken: row.verifyToken,
      testEventCode: row.testEventCode,
      accessToken: decryptField(row.accessToken),
      appSecret: decryptField(row.appSecret),
      pageAccessToken: decryptField(row.pageAccessToken),
    };
  },
});

/**
 * Public action — called from the admin settings UI to save Meta config.
 *
 * Each secret field is three-valued:
 *   - omitted      → leave unchanged
 *   - ""           → clear the stored value
 *   - "something"  → encrypt and store
 *
 * Plaintext fields (pixelId, verifyToken, testEventCode, enabled) always overwrite.
 *
 * Auth: matches the existing project pattern — Convex mutations/actions called
 * from admin pages rely on the Next.js cookie auth to gate access. Anyone with
 * the Convex URL can technically call this; acceptable for internal single-tenant use.
 */
export const save = action({
  args: {
    pixelId: v.optional(v.string()),
    verifyToken: v.optional(v.string()),
    testEventCode: v.optional(v.string()),
    enabled: v.boolean(),
    accessToken: v.optional(v.string()), // plaintext; "" to clear
    appSecret: v.optional(v.string()),
    pageAccessToken: v.optional(v.string()),
    updatedByUserId: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args): Promise<{ saved: boolean }> => {
    const encryptOrClear = (plaintext?: string) => {
      if (plaintext === undefined) return undefined; // leave as-is
      if (plaintext === "") return null; // clear
      return encryptCredentials(plaintext);
    };

    await ctx.runMutation(internal.metaConfig.upsertInternal, {
      pixelId: args.pixelId,
      verifyToken: args.verifyToken,
      testEventCode: args.testEventCode,
      enabled: args.enabled,
      accessToken: encryptOrClear(args.accessToken),
      appSecret: encryptOrClear(args.appSecret),
      pageAccessToken: encryptOrClear(args.pageAccessToken),
      updatedByUserId: args.updatedByUserId,
    });

    return { saved: true };
  },
});

/** Public action — sends a test "Lead" event to verify the config works end-to-end. */
export const sendTestEvent = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; error?: string; fbTraceId?: string; testMode: boolean }> => {
    const config: ResolvedMetaConfig = await ctx.runAction(
      internal.metaConfigNode.getDecryptedInternal,
      {}
    );
    if (!config.configured || !config.pixelId || !config.accessToken) {
      return { success: false, error: "Config not complete — need at least Pixel ID + Access Token.", testMode: false };
    }

    const result = await sendMetaEvent(
      {
        eventName: "Lead",
        eventId: `test:${Date.now()}`,
        eventTime: Math.floor(Date.now() / 1000),
        userData: {
          email: "test@example.com",
          phone: "+15555550100",
          fullName: "Test Lead",
          externalId: `test-${Date.now()}`,
        },
        customData: {
          leadStatus: "test",
          leadEventSource: "settings_test_button",
        },
        actionSource: "system_generated",
      },
      {
        pixelId: config.pixelId,
        accessToken: config.accessToken,
        testEventCode: config.testEventCode,
      }
    );
    return {
      success: result.success,
      error: result.error,
      fbTraceId: result.fbTraceId,
      testMode: result.testMode,
    };
  },
});
