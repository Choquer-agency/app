import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {
    scope: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.clientId) {
      return await ctx.db
        .query("apiConnections")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .collect();
    }
    if (args.platform && args.scope) {
      const all = await ctx.db
        .query("apiConnections")
        .withIndex("by_platform_scope", (q) =>
          q.eq("platform", args.platform!).eq("scope", args.scope!)
        )
        .collect();
      return all;
    }
    if (args.scope) {
      const all = await ctx.db.query("apiConnections").collect();
      return all.filter((c) => c.scope === args.scope);
    }
    return await ctx.db.query("apiConnections").collect();
  },
});

export const getById = query({
  args: { id: v.id("apiConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const upsert = mutation({
  args: {
    platform: v.string(),
    scope: v.string(),
    clientId: v.optional(v.id("clients")),
    authType: v.string(),
    encryptedCreds: v.string(),
    credsIv: v.string(),
    oauthAccountId: v.optional(v.string()),
    oauthAccountName: v.optional(v.string()),
    oauthExpiresAt: v.optional(v.string()),
    refreshTokenCiphertext: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    availableAccounts: v.optional(
      v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          kind: v.optional(v.string()),
        })
      )
    ),
    status: v.string(),
    lastVerifiedAt: v.optional(v.string()),
    lastError: v.optional(v.string()),
    displayName: v.optional(v.string()),
    addedById: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    // Check for existing connection with same platform + scope + clientId
    const existing = await ctx.db
      .query("apiConnections")
      .withIndex("by_platform_scope", (q) =>
        q.eq("platform", args.platform).eq("scope", args.scope)
      )
      .collect();

    const match = existing.find((c) =>
      args.clientId ? c.clientId === args.clientId : !c.clientId
    );

    if (match) {
      await ctx.db.patch(match._id, {
        authType: args.authType,
        encryptedCreds: args.encryptedCreds,
        credsIv: args.credsIv,
        oauthAccountId: args.oauthAccountId,
        oauthAccountName: args.oauthAccountName,
        oauthExpiresAt: args.oauthExpiresAt,
        refreshTokenCiphertext: args.refreshTokenCiphertext,
        refreshTokenIv: args.refreshTokenIv,
        tokenExpiresAt: args.tokenExpiresAt,
        availableAccounts: args.availableAccounts,
        status: args.status,
        lastVerifiedAt: args.lastVerifiedAt,
        lastError: args.lastError,
        displayName: args.displayName,
      });
      return match._id;
    }

    return await ctx.db.insert("apiConnections", args);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("apiConnections"),
    status: v.string(),
    lastVerifiedAt: v.optional(v.string()),
    lastError: v.optional(v.string()),
    encryptedCreds: v.optional(v.string()),
    credsIv: v.optional(v.string()),
    oauthExpiresAt: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    refreshTokenCiphertext: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("apiConnections") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
