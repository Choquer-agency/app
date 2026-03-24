import { v } from "convex/values";
import { query, mutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("clientPackages")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // Enrich with package details (replaces SQL JOIN)
    const enriched = await Promise.all(
      assignments.map(async (cp) => {
        const pkg = await ctx.db.get(cp.packageId);
        return {
          ...cp,
          packageName: pkg?.name ?? "",
          packageDefaultPrice: pkg?.defaultPrice ?? 0,
          packageCategory: pkg?.category ?? "other",
          packageHoursIncluded: pkg?.hoursIncluded ?? null,
          packageSetupFee: pkg?.setupFee ?? 0,
        };
      })
    );
    return enriched;
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    packageId: v.id("packages"),
    customPrice: v.optional(v.number()),
    customHours: v.optional(v.number()),
    applySetupFee: v.optional(v.boolean()),
    customSetupFee: v.optional(v.number()),
    signupDate: v.optional(v.string()),
    contractEndDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("clientPackages", {
      clientId: args.clientId,
      packageId: args.packageId,
      customPrice: args.customPrice,
      customHours: args.customHours,
      applySetupFee: args.applySetupFee ?? false,
      customSetupFee: args.customSetupFee,
      signupDate: args.signupDate ?? new Date().toISOString().split("T")[0],
      contractEndDate: args.contractEndDate,
      active: true,
      notes: args.notes ?? "",
    });

    // Sync MRR on client
    await syncClientMrr(ctx, args.clientId);

    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("clientPackages"),
    customPrice: v.optional(v.number()),
    customHours: v.optional(v.number()),
    applySetupFee: v.optional(v.boolean()),
    customSetupFee: v.optional(v.number()),
    signupDate: v.optional(v.string()),
    contractEndDate: v.optional(v.string()),
    active: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const existing = await ctx.db.get(id);
    if (!existing) return null;

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    await ctx.db.patch(id, updates);

    // Sync MRR on client
    await syncClientMrr(ctx, existing.clientId);

    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("clientPackages") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return false;
    await ctx.db.delete(args.id);
    await syncClientMrr(ctx, existing.clientId);
    return true;
  },
});

// Helper: recalculate client MRR from active package assignments
async function syncClientMrr(ctx: MutationCtx, clientId: Id<"clients">) {
  const assignments = await ctx.db
    .query("clientPackages")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();

  let mrr = 0;
  for (const cp of assignments) {
    if (cp.active) {
      if (cp.customPrice != null) {
        mrr += cp.customPrice;
      } else {
        const pkg = await ctx.db.get(cp.packageId);
        mrr += pkg?.defaultPrice ?? 0;
      }
    }
  }
  await ctx.db.patch(clientId, { mrr });
}
