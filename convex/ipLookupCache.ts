import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const RAW_IP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const lookup = query({
  args: { ipHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ipLookupCache")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    ipHash: v.string(),
    companyId: v.optional(v.id("identifiedCompanies")),
    raw: v.optional(v.any()),
    isIsp: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ipLookupCache")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        companyId: args.companyId,
        raw: args.raw,
        isIsp: args.isIsp,
        lookedUpAt: new Date().toISOString(),
        rawIp: undefined,
        rawIpExpiresAt: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("ipLookupCache", {
      ipHash: args.ipHash,
      companyId: args.companyId,
      raw: args.raw,
      isIsp: args.isIsp,
      lookedUpAt: new Date().toISOString(),
    });
  },
});

// Queue a raw IP for the enrichment cron to batch-lookup later.
// Used when real-time IPinfo lookup is skipped or fails during ingest.
export const queueRawIp = mutation({
  args: {
    ipHash: v.string(),
    rawIp: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ipLookupCache")
      .withIndex("by_ipHash", (q) => q.eq("ipHash", args.ipHash))
      .unique();

    if (existing) {
      // If we already enriched this hash, don't re-queue.
      if (existing.companyId !== undefined || existing.isIsp) {
        return existing._id;
      }
      await ctx.db.patch(existing._id, {
        rawIp: args.rawIp,
        rawIpExpiresAt: Date.now() + RAW_IP_TTL_MS,
      });
      return existing._id;
    }

    return await ctx.db.insert("ipLookupCache", {
      ipHash: args.ipHash,
      isIsp: false,
      lookedUpAt: new Date().toISOString(),
      rawIp: args.rawIp,
      rawIpExpiresAt: Date.now() + RAW_IP_TTL_MS,
    });
  },
});

// Pull pending (non-expired) raw IPs for the enrichment cron.
export const listPendingRawIps = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = await ctx.db
      .query("ipLookupCache")
      .withIndex("by_rawIp")
      .take(args.limit ?? 500);
    return results.filter(
      (r) =>
        r.rawIp &&
        r.companyId === undefined &&
        !r.isIsp &&
        (r.rawIpExpiresAt === undefined || r.rawIpExpiresAt > now),
    );
  },
});

// Purge the raw IP after enrichment (or expiry) — keeps the cache row
// but strips the sensitive plaintext IP.
export const purgeRawIp = mutation({
  args: { id: v.id("ipLookupCache") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      rawIp: undefined,
      rawIpExpiresAt: undefined,
    });
  },
});
