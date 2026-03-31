import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const create = mutation({
  args: {
    connectionId: v.id("apiConnections"),
    event: v.string(),
    detail: v.optional(v.string()),
    actorId: v.optional(v.id("teamMembers")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("connectionLogs", args);
  },
});

export const listByConnection = query({
  args: {
    connectionId: v.id("apiConnections"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("connectionLogs")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .order("desc")
      .take(limit);
  },
});
