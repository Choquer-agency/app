import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("leadLogs")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
    return rows.sort((a, b) => b.occurredAt - a.occurredAt);
  },
});

export const create = mutation({
  args: {
    leadId: v.id("leads"),
    type: v.string(),
    title: v.string(),
    content: v.string(),
    occurredAt: v.optional(v.number()),
    createdBy: v.optional(v.id("teamMembers")),
    createdByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("leadLogs", {
      leadId: args.leadId,
      type: args.type,
      title: args.title,
      content: args.content,
      occurredAt: args.occurredAt ?? Date.now(),
      createdBy: args.createdBy,
      createdByName: args.createdByName,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("leadLogs"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
  },
});

export const remove = mutation({
  args: { id: v.id("leadLogs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
