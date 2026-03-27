import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {
    limit: v.optional(v.number()),
    maxAgeDays: v.optional(v.number()),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 15;
    const maxAgeDays = args.maxAgeDays ?? 2;
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const entries = await ctx.db
      .query("changelog")
      .order("desc")
      .take(limit);
    return entries.filter((e) => {
      if (e._creationTime < cutoff) return false;
      if (args.visibility === "team") {
        return (e.visibility ?? "team") === "team";
      }
      return true;
    });
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    category: v.string(),
    icon: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    authorName: v.optional(v.string()),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("changelog", {
      title: args.title,
      description: args.description,
      category: args.category,
      icon: args.icon,
      imageUrl: args.imageUrl,
      authorName: args.authorName ?? "Bryce",
      visibility: args.visibility ?? "team",
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("changelog"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    icon: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: {
    id: v.id("changelog"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
