import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const upsertByFingerprint = mutation({
  args: {
    siteId: v.id("trackedSites"),
    fingerprint: v.string(),
    ipHash: v.string(),
    device: v.optional(v.string()),
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("siteVisitors")
      .withIndex("by_fingerprint", (q) =>
        q.eq("siteId", args.siteId).eq("fingerprint", args.fingerprint)
      )
      .unique();

    if (existing) {
      // Return visitor — calculate intent
      const lastVisit = new Date(existing.lastSeenAt).getTime();
      const now = new Date(args.timestamp).getTime();
      const gapMs = now - lastVisit;
      const gapHours = gapMs / (1000 * 60 * 60);
      const newVisitCount = existing.visitCount + 1;

      let intentLevel = existing.intentLevel;
      // Only recalculate if this is a new session (>30 min gap)
      if (gapMs > 30 * 60 * 1000) {
        if (newVisitCount >= 3 || gapHours >= 48) {
          intentLevel = "high_intent";
        } else if (newVisitCount === 2) {
          intentLevel = "returning";
        }
      }

      await ctx.db.patch(existing._id, {
        lastSeenAt: args.timestamp,
        visitCount: newVisitCount,
        intentLevel,
        device: args.device ?? existing.device,
        browser: args.browser ?? existing.browser,
        os: args.os ?? existing.os,
        country: args.country ?? existing.country,
        region: args.region ?? existing.region,
        city: args.city ?? existing.city,
      });

      return {
        id: existing._id,
        isNew: false,
        intentLevel,
        previousIntent: existing.intentLevel,
        visitCount: newVisitCount,
        companyId: existing.companyId,
        lastAlertedAt: existing.lastAlertedAt,
      };
    }

    // New visitor
    const id = await ctx.db.insert("siteVisitors", {
      siteId: args.siteId,
      fingerprint: args.fingerprint,
      ipHash: args.ipHash,
      firstSeenAt: args.timestamp,
      lastSeenAt: args.timestamp,
      visitCount: 1,
      device: args.device,
      browser: args.browser,
      os: args.os,
      country: args.country,
      region: args.region,
      city: args.city,
      intentLevel: "new",
    });

    return {
      id,
      isNew: true,
      intentLevel: "new",
      previousIntent: null,
      visitCount: 1,
      companyId: null,
      lastAlertedAt: null,
    };
  },
});

export const listBySite = query({
  args: {
    siteId: v.id("trackedSites"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("siteVisitors")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByCompany = query({
  args: { companyId: v.id("identifiedCompanies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("siteVisitors")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const getHighIntentVisitors = query({
  args: { siteId: v.id("trackedSites") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("siteVisitors")
      .withIndex("by_intent", (q) =>
        q.eq("siteId", args.siteId).eq("intentLevel", "high_intent")
      )
      .order("desc")
      .take(50);
  },
});

export const linkCompany = mutation({
  args: {
    id: v.id("siteVisitors"),
    companyId: v.id("identifiedCompanies"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { companyId: args.companyId });
  },
});

// Patch enrichment data (location + optional company link) onto a visitor.
// Used after IPinfo lookup completes — separate from upsertByFingerprint
// because IPinfo runs after the initial visitor row is created.
export const applyEnrichment = mutation({
  args: {
    id: v.id("siteVisitors"),
    companyId: v.optional(v.id("identifiedCompanies")),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.companyId !== undefined) patch.companyId = args.companyId;
    if (args.country !== undefined) patch.country = args.country;
    if (args.region !== undefined) patch.region = args.region;
    if (args.city !== undefined) patch.city = args.city;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(args.id, patch);
  },
});

export const updateAlertedAt = mutation({
  args: {
    id: v.id("siteVisitors"),
    lastAlertedAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastAlertedAt: args.lastAlertedAt });
  },
});

// List visitors that need IP enrichment (no company linked yet)
export const listUnenriched = query({
  args: { siteId: v.id("trackedSites"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const visitors = await ctx.db
      .query("siteVisitors")
      .withIndex("by_site", (q) => q.eq("siteId", args.siteId))
      .take(args.limit ?? 200);
    // Filter to those without a company
    return visitors.filter((v) => !v.companyId);
  },
});
