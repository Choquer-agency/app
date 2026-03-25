import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: {
    category: v.optional(v.string()),
    month: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    let entries;
    if (args.category && args.month) {
      entries = await ctx.db
        .query("serviceBoardEntries")
        .withIndex("by_category_month", (q) =>
          q.eq("category", args.category!).eq("month", args.month!)
        )
        .collect();
    } else if (args.clientId) {
      entries = await ctx.db
        .query("serviceBoardEntries")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .collect();
    } else {
      entries = await ctx.db.query("serviceBoardEntries").collect();
    }

    // Join with clients, packages, clientPackages, and teamMembers
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const client = await ctx.db.get(entry.clientId);
        const clientPkg = await ctx.db.get(entry.clientPackageId);
        const pkg = clientPkg ? await ctx.db.get(clientPkg.packageId) : null;
        const specialist = entry.specialistId
          ? await ctx.db.get(entry.specialistId)
          : null;

        return {
          ...entry,
          clientName: client?.name ?? "",
          clientSlug: client?.slug ?? "",
          clientNotionPageUrl: client?.notionPageUrl ?? "",
          packageName: pkg?.name ?? "",
          includedHours: clientPkg?.customHours ?? pkg?.hoursIncluded ?? 0,
          specialistName: specialist?.name ?? undefined,
          specialistColor: specialist?.color ?? undefined,
          specialistProfilePicUrl: specialist?.profilePicUrl ?? undefined,
        };
      })
    );

    return enriched;
  },
});

export const getById = query({
  args: { id: v.id("serviceBoardEntries") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry) return null;

    const client = await ctx.db.get(entry.clientId);
    const clientPkg = await ctx.db.get(entry.clientPackageId);
    const pkg = clientPkg ? await ctx.db.get(clientPkg.packageId) : null;
    const specialist = entry.specialistId
      ? await ctx.db.get(entry.specialistId)
      : null;

    return {
      ...entry,
      clientName: client?.name ?? "",
      clientSlug: client?.slug ?? "",
      clientNotionPageUrl: client?.notionPageUrl ?? "",
      packageName: pkg?.name ?? "",
      includedHours: clientPkg?.customHours ?? pkg?.hoursIncluded ?? 0,
      specialistName: specialist?.name ?? undefined,
      specialistColor: specialist?.color ?? undefined,
      specialistProfilePicUrl: specialist?.profilePicUrl ?? undefined,
    };
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
