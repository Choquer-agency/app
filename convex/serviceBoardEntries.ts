import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {
    category: v.optional(v.string()),
    month: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    if (args.category && args.month) {
      return await ctx.db
        .query("serviceBoardEntries")
        .withIndex("by_category_month", (q) =>
          q.eq("category", args.category!).eq("month", args.month!)
        )
        .collect();
    }
    if (args.clientId) {
      return await ctx.db
        .query("serviceBoardEntries")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .collect();
    }
    return await ctx.db.query("serviceBoardEntries").collect();
  },
});

export const getById = query({
  args: { id: v.id("serviceBoardEntries") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    clientPackageId: v.id("clientPackages"),
    category: v.string(),
    month: v.string(),
    status: v.optional(v.string()),
    specialistId: v.optional(v.id("teamMembers")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("serviceBoardEntries")
      .withIndex("by_package_month", (q) =>
        q.eq("clientPackageId", args.clientPackageId).eq("month", args.month)
      )
      .take(1);
    if (existing.length > 0) return existing[0]._id;

    return await ctx.db.insert("serviceBoardEntries", {
      clientId: args.clientId,
      clientPackageId: args.clientPackageId,
      category: args.category,
      month: args.month,
      status: args.status ?? "needs_attention",
      specialistId: args.specialistId,
      notes: args.notes ?? "",
    });
  },
});

export const createIfNotExists = mutation({
  args: {
    clientId: v.id("clients"),
    clientPackageId: v.id("clientPackages"),
    category: v.string(),
    month: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if entry already exists
    const existing = await ctx.db
      .query("serviceBoardEntries")
      .withIndex("by_package_month", (q) =>
        q.eq("clientPackageId", args.clientPackageId).eq("month", args.month)
      )
      .first();

    if (existing) return existing;

    const id = await ctx.db.insert("serviceBoardEntries", {
      clientId: args.clientId,
      clientPackageId: args.clientPackageId,
      category: args.category,
      month: args.month,
      status: "not_started",
      notes: "",
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("serviceBoardEntries"),
    status: v.optional(v.string()),
    specialistId: v.optional(v.id("teamMembers")),
    notes: v.optional(v.string()),
    monthlyEmailSentAt: v.optional(v.string()),
    quarterlyEmailSentAt: v.optional(v.string()),
    generatedEmail: v.optional(v.string()),
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
