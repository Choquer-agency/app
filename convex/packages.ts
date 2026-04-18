import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = args.activeOnly
      ? await ctx.db
          .query("packages")
          .withIndex("by_active", (q) => q.eq("active", true))
          .collect()
      : await ctx.db.query("packages").collect();

    // Sort: group by category, then numerically by hours/tier in the name
    // so Retainer packages line up as 5, 10, 15, 20, 30, 40.
    const categoryOrder: Record<string, number> = {
      retainer: 0,
      seo: 1,
      google_ads: 2,
      social_media_ads: 3,
      web_dev: 4,
      other: 5,
    };
    function extractNumber(name: string): number {
      const m = name.match(/(\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : Number.POSITIVE_INFINITY;
    }
    return rows.sort((a, b) => {
      const ca = categoryOrder[a.category ?? "other"] ?? 99;
      const cb = categoryOrder[b.category ?? "other"] ?? 99;
      if (ca !== cb) return ca - cb;
      const na = extractNumber(a.name ?? "");
      const nb = extractNumber(b.name ?? "");
      if (na !== nb) return na - nb;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  },
});

export const getById = query({
  args: { id: v.id("packages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    defaultPrice: v.number(),
    category: v.optional(v.string()),
    billingFrequency: v.optional(v.string()),
    hoursIncluded: v.optional(v.number()),
    includedServices: v.optional(v.array(v.string())),
    setupFee: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Prevent duplicate package names
    const existing = await ctx.db.query("packages").collect();
    const duplicate = existing.find(
      (p) => p.name.toLowerCase() === args.name.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A package named "${args.name}" already exists`);
    }

    const id = await ctx.db.insert("packages", {
      name: args.name,
      description: args.description ?? "",
      defaultPrice: args.defaultPrice,
      category: args.category ?? "other",
      billingFrequency: args.billingFrequency ?? "monthly",
      hoursIncluded: args.hoursIncluded,
      includedServices: args.includedServices ?? [],
      setupFee: args.setupFee ?? 0,
      active: args.active ?? true,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("packages"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultPrice: v.optional(v.number()),
    category: v.optional(v.string()),
    billingFrequency: v.optional(v.string()),
    hoursIncluded: v.optional(v.number()),
    includedServices: v.optional(v.array(v.string())),
    setupFee: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const softDelete = mutation({
  args: { id: v.id("packages") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: false });
  },
});

export const hardDelete = mutation({
  args: { id: v.id("packages") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// One-time cleanup: remove duplicate packages by name, re-pointing clientPackage references
export const deduplicate = mutation({
  args: {},
  handler: async (ctx) => {
    const allPackages = await ctx.db.query("packages").collect();
    const allClientPackages = await ctx.db.query("clientPackages").collect();

    // Group packages by lowercase name
    const byName = new Map<string, typeof allPackages>();
    for (const pkg of allPackages) {
      const key = pkg.name.toLowerCase();
      const group = byName.get(key) || [];
      group.push(pkg);
      byName.set(key, group);
    }

    let deleted = 0;
    let repointed = 0;

    for (const [, group] of byName) {
      if (group.length <= 1) continue;

      // Find which package IDs are referenced by clientPackages
      const referencedIds = new Set(
        allClientPackages
          .filter((cp) => group.some((p) => p._id === cp.packageId))
          .map((cp) => cp.packageId)
      );

      // Keep the referenced one, or the first one if none are referenced
      const keep = group.find((p) => referencedIds.has(p._id)) || group[0];
      const duplicates = group.filter((p) => p._id !== keep._id);

      for (const dup of duplicates) {
        // Re-point any clientPackage references from the duplicate to the kept package
        const affectedAssignments = allClientPackages.filter(
          (cp) => cp.packageId === dup._id
        );
        for (const cp of affectedAssignments) {
          await ctx.db.patch(cp._id, { packageId: keep._id });
          repointed++;
        }
        // Delete the duplicate
        await ctx.db.delete(dup._id);
        deleted++;
      }
    }

    return { deleted, repointed };
  },
});
