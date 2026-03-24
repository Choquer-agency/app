import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByClient = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clientNotes")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    author: v.optional(v.string()),
    noteType: v.optional(v.string()),
    content: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("clientNotes", {
      clientId: args.clientId,
      author: args.author ?? "Admin",
      noteType: args.noteType ?? "note",
      content: args.content,
      metadata: args.metadata ?? {},
    });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("clientNotes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
