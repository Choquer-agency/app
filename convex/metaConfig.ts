import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";

/** Public query — returns sanitized config for the settings UI. Secrets are not returned. */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("metaAdsConfig").first();
    if (!row) {
      return {
        configured: false,
        enabled: false,
        pixelId: undefined,
        verifyToken: undefined,
        testEventCode: undefined,
        hasAccessToken: false,
        hasAppSecret: false,
        hasPageAccessToken: false,
        updatedAt: undefined,
      };
    }
    return {
      configured: true,
      enabled: row.enabled,
      pixelId: row.pixelId,
      verifyToken: row.verifyToken,
      testEventCode: row.testEventCode,
      hasAccessToken: Boolean(row.accessToken),
      hasAppSecret: Boolean(row.appSecret),
      hasPageAccessToken: Boolean(row.pageAccessToken),
      updatedAt: row.updatedAt,
    };
  },
});

/** Internal query — returns the full row (including ciphertext) for actions to decrypt. */
export const getRowInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("metaAdsConfig").first();
  },
});

/**
 * Internal mutation — upserts the singleton config row. Called from the save action
 * (which handles encryption in Node runtime before calling this).
 *
 * Each secret field is optional on the update side. Passing `null` explicitly clears
 * a secret; omitting the field leaves it as-is. Plaintext fields (pixelId, verifyToken,
 * testEventCode, enabled) always take the passed value.
 */
export const upsertInternal = internalMutation({
  args: {
    pixelId: v.optional(v.string()),
    verifyToken: v.optional(v.string()),
    testEventCode: v.optional(v.string()),
    enabled: v.boolean(),
    accessToken: v.optional(
      v.union(
        v.null(),
        v.object({ ciphertext: v.string(), iv: v.string() })
      )
    ),
    appSecret: v.optional(
      v.union(
        v.null(),
        v.object({ ciphertext: v.string(), iv: v.string() })
      )
    ),
    pageAccessToken: v.optional(
      v.union(
        v.null(),
        v.object({ ciphertext: v.string(), iv: v.string() })
      )
    ),
    updatedByUserId: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("metaAdsConfig").first();

    const plain: Record<string, unknown> = {
      pixelId: args.pixelId,
      verifyToken: args.verifyToken,
      testEventCode: args.testEventCode,
      enabled: args.enabled,
      updatedAt: now,
    };
    if (args.updatedByUserId) plain.updatedByUserId = args.updatedByUserId;

    const applySecret = (
      key: "accessToken" | "appSecret" | "pageAccessToken",
      value: { ciphertext: string; iv: string } | null | undefined
    ) => {
      if (value === undefined) return; // leave as-is
      if (value === null) {
        plain[key] = undefined; // clear
      } else {
        plain[key] = value;
      }
    };
    applySecret("accessToken", args.accessToken);
    applySecret("appSecret", args.appSecret);
    applySecret("pageAccessToken", args.pageAccessToken);

    if (existing) {
      await ctx.db.patch(existing._id, plain);
      return existing._id;
    }
    return await ctx.db.insert("metaAdsConfig", plain as any);
  },
});
