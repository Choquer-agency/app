import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByTeamMember = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, { teamMemberId }) => {
    const rows = await ctx.db
      .query("mcpTokens")
      .withIndex("by_teamMember", (q) => q.eq("teamMemberId", teamMemberId))
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      label: r.label,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      revokedAt: r.revokedAt,
    }));
  },
});

export const create = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    tokenHash: v.string(),
    encryptedToken: v.optional(v.string()),
    tokenIv: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("mcpTokens", {
      teamMemberId: args.teamMemberId,
      tokenHash: args.tokenHash,
      encryptedToken: args.encryptedToken,
      tokenIv: args.tokenIv,
      label: args.label,
      createdAt: new Date().toISOString(),
    });
  },
});

export const getPrimary = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, { teamMemberId }) => {
    const rows = await ctx.db
      .query("mcpTokens")
      .withIndex("by_teamMember", (q) => q.eq("teamMemberId", teamMemberId))
      .collect();
    const active = rows
      .filter((r) => !r.revokedAt)
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0];
    if (!active) return null;
    return {
      _id: active._id,
      createdAt: active.createdAt,
      lastUsedAt: active.lastUsedAt,
      encryptedToken: active.encryptedToken,
      tokenIv: active.tokenIv,
    };
  },
});

export const revokeAllForTeamMember = mutation({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, { teamMemberId }) => {
    const rows = await ctx.db
      .query("mcpTokens")
      .withIndex("by_teamMember", (q) => q.eq("teamMemberId", teamMemberId))
      .collect();
    const now = new Date().toISOString();
    for (const r of rows) {
      if (!r.revokedAt) {
        await ctx.db.patch(r._id, { revokedAt: now });
      }
    }
  },
});

export const revoke = mutation({
  args: { id: v.id("mcpTokens") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { revokedAt: new Date().toISOString() });
  },
});

export const verifyByHash = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query("mcpTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!row || row.revokedAt) return null;
    const member = await ctx.db.get(row.teamMemberId);
    if (!member || member.active === false) return null;
    return {
      tokenId: row._id,
      teamMemberId: row.teamMemberId,
      teamMemberName: member.name,
      roleLevel: member.roleLevel ?? "employee",
    };
  },
});

export const markUsed = mutation({
  args: { id: v.id("mcpTokens") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { lastUsedAt: new Date().toISOString() });
  },
});
