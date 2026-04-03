import { v } from "convex/values";
import { query, mutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const getById = query({
  args: { id: v.id("clientPackages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

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
          packageBillingFrequency: pkg?.billingFrequency ?? "monthly",
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
    isOneTime: v.optional(v.boolean()),
    paidDate: v.optional(v.string()),
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
      isOneTime: args.isOneTime ?? false,
      paidDate: args.isOneTime ? (args.paidDate ?? args.signupDate ?? new Date().toISOString().split("T")[0]) : undefined,
    });

    // Sync MRR on client (one-time payments excluded)
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
    isOneTime: v.optional(v.boolean()),
    paidDate: v.optional(v.string()),
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

// List all active packages (for service board filtering by category)
export const listActiveByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("clientPackages").collect();
    const active = all.filter((cp) => cp.active && !cp.isOneTime);

    // Enrich with package details and filter by category
    const results = [];
    for (const cp of active) {
      const pkg = await ctx.db.get(cp.packageId);
      if (pkg && pkg.category === args.category) {
        const client = await ctx.db.get(cp.clientId);
        results.push({
          ...cp,
          packageName: pkg.name ?? "",
          packageCategory: pkg.category ?? "other",
          packageHoursIncluded: pkg.hoursIncluded ?? null,
          clientName: client?.name ?? "",
          clientSlug: client?.slug ?? "",
        });
      }
    }
    return results;
  },
});

// === Package Cancellation ===

export const cancelPackage = mutation({
  args: {
    id: v.id("clientPackages"),
    cancelType: v.union(v.literal("30_day"), v.literal("immediate")),
    cancellationFee: v.optional(v.number()),
    canceledBy: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;
    if (existing.canceledAt) return existing; // Already canceled

    const today = new Date().toISOString().split("T")[0];
    let effectiveEndDate: string;

    if (args.cancelType === "immediate") {
      effectiveEndDate = today;
    } else {
      // 30-day notice: last day of next month
      const now = new Date();
      const lastDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      effectiveEndDate = lastDayNextMonth.toISOString().split("T")[0];
    }

    const patch: Record<string, unknown> = {
      canceledAt: today,
      effectiveEndDate,
      canceledBy: args.canceledBy,
    };
    if (args.cancellationFee !== undefined) {
      patch.cancellationFee = args.cancellationFee;
    }
    if (args.cancelType === "immediate") {
      patch.active = false;
    }

    await ctx.db.patch(args.id, patch);

    if (args.cancelType === "immediate") {
      await syncClientMrr(ctx, existing.clientId);
    }

    // Check if this was the last active recurring package → trigger offboarding
    const allPackages = await ctx.db
      .query("clientPackages")
      .withIndex("by_client", (q) => q.eq("clientId", existing.clientId))
      .collect();
    const hasActiveRecurring = allPackages.some(
      (cp) => cp._id !== args.id && cp.active && !cp.isOneTime && !cp.canceledAt
    );
    if (!hasActiveRecurring) {
      await ctx.db.patch(existing.clientId, {
        clientStatus: "offboarding",
        offboardingDate: effectiveEndDate,
      });
    }

    return await ctx.db.get(args.id);
  },
});

export const listCanceledActive = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("clientPackages")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return all.filter((cp) => cp.canceledAt && cp.effectiveEndDate);
  },
});

export const deactivateExpired = mutation({
  args: { id: v.id("clientPackages") },
  handler: async (ctx, args) => {
    const cp = await ctx.db.get(args.id);
    if (!cp || !cp.active) return false;
    await ctx.db.patch(args.id, { active: false });
    await syncClientMrr(ctx, cp.clientId);

    // Check if client should transition to inactive
    const allPackages = await ctx.db
      .query("clientPackages")
      .withIndex("by_client", (q) => q.eq("clientId", cp.clientId))
      .collect();
    const hasActive = allPackages.some((p) => p._id !== args.id && p.active && !p.isOneTime);
    if (!hasActive) {
      const client = await ctx.db.get(cp.clientId);
      if (client?.clientStatus === "offboarding") {
        await ctx.db.patch(cp.clientId, { clientStatus: "inactive" });
      }
    }

    return true;
  },
});

// Helper: recalculate client MRR from active package assignments (excludes one-time payments)
async function syncClientMrr(ctx: MutationCtx, clientId: Id<"clients">) {
  const assignments = await ctx.db
    .query("clientPackages")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();

  let mrr = 0;
  for (const cp of assignments) {
    if (cp.active && !cp.isOneTime) {
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
