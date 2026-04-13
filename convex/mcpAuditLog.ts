import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const log = mutation({
  args: {
    actor: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("mcpAuditLog", args);
  },
});

export const create = mutation({
  args: {
    actor: v.string(),
    detail: v.string(),
    teamMemberId: v.optional(v.id("teamMembers")),
    tool: v.optional(v.string()),
    success: v.optional(v.boolean()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("mcpAuditLog", args);
  },
});

export const recent = query({
  args: {
    limit: v.optional(v.number()),
    teamMemberId: v.optional(v.id("teamMembers")),
    tool: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.teamMemberId) {
      return await ctx.db
        .query("mcpAuditLog")
        .withIndex("by_teamMember", (q) => q.eq("teamMemberId", args.teamMemberId))
        .order("desc")
        .take(args.limit ?? 100);
    }
    if (args.tool) {
      return await ctx.db
        .query("mcpAuditLog")
        .withIndex("by_tool", (q) => q.eq("tool", args.tool))
        .order("desc")
        .take(args.limit ?? 100);
    }
    return await ctx.db.query("mcpAuditLog").order("desc").take(args.limit ?? 100);
  },
});
