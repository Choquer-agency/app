import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractNotionPageId(url: string): string {
  if (!url) return "";
  const match = url.match(/([a-f0-9]{32})(?:\?|$)/);
  if (match) return match[1];
  const dashMatch = url.match(
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
  );
  if (dashMatch) return dashMatch[1].replace(/-/g, "");
  return "";
}

function normalizeGscUrl(url: string): string {
  if (!url) return "";
  let gscSiteUrl = url;
  if (!url.startsWith("sc-domain:") && !url.startsWith("http")) {
    gscSiteUrl = `sc-domain:${url}`;
  }
  if (gscSiteUrl.startsWith("http") && !gscSiteUrl.endsWith("/")) {
    gscSiteUrl += "/";
  }
  return gscSiteUrl;
}

function normalizeGa4Id(id: string): string {
  if (!id) return "";
  if (!id.startsWith("properties/")) {
    return `properties/${id}`;
  }
  return id;
}

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.includeInactive) {
      return await ctx.db.query("clients").collect();
    }
    // Active clients that aren't past offboarding date
    const allClients = await ctx.db
      .query("clients")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const now = new Date().toISOString().split("T")[0];
    return allClients.filter(
      (c) =>
        c.clientStatus !== "inactive" &&
        !(c.clientStatus === "offboarding" && c.offboardingDate && c.offboardingDate <= now)
    );
  },
});

export const getPastClients = query({
  args: {},
  handler: async (ctx) => {
    const allClients = await ctx.db.query("clients").collect();
    const now = new Date().toISOString().split("T")[0];
    return allClients.filter(
      (c) =>
        !c.active ||
        c.clientStatus === "inactive" ||
        (c.clientStatus === "offboarding" && c.offboardingDate && c.offboardingDate <= now)
    );
  },
});

export const getById = query({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .take(1);
    return clients[0] ?? null;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    ga4PropertyId: v.optional(v.string()),
    gscSiteUrl: v.optional(v.string()),
    seRankingsProjectId: v.optional(v.string()),
    calLink: v.optional(v.string()),
    notionPageUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
    websiteUrl: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contractStartDate: v.optional(v.string()),
    contractEndDate: v.optional(v.string()),
    mrr: v.optional(v.number()),
    country: v.optional(v.string()),
    seoHoursAllocated: v.optional(v.number()),
    accountSpecialist: v.optional(v.string()),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.optional(v.string()),
    provinceState: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    clientStatus: v.optional(v.string()),
    offboardingDate: v.optional(v.string()),
    industry: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    lastContactDate: v.optional(v.string()),
    nextReviewDate: v.optional(v.string()),
    socialLinkedin: v.optional(v.string()),
    socialFacebook: v.optional(v.string()),
    socialInstagram: v.optional(v.string()),
    socialX: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = generateSlug(args.name);
    const notionPageId = extractNotionPageId(args.notionPageUrl ?? "");
    const gscSiteUrl = normalizeGscUrl(args.gscSiteUrl ?? "");
    const ga4PropertyId = normalizeGa4Id(args.ga4PropertyId ?? "");

    const id = await ctx.db.insert("clients", {
      name: args.name,
      slug,
      active: args.active ?? true,
      ga4PropertyId,
      gscSiteUrl,
      seRankingsProjectId: args.seRankingsProjectId ?? "",
      calLink: args.calLink ?? "",
      notionPageUrl: args.notionPageUrl ?? "",
      notionPageId,
      websiteUrl: args.websiteUrl ?? "",
      contactName: args.contactName ?? "",
      contactEmail: args.contactEmail ?? "",
      contactPhone: args.contactPhone ?? "",
      contractStartDate: args.contractStartDate,
      contractEndDate: args.contractEndDate,
      mrr: args.mrr ?? 0,
      country: args.country ?? "CA",
      seoHoursAllocated: args.seoHoursAllocated ?? 0,
      accountSpecialist: args.accountSpecialist ?? "",
      addressLine1: args.addressLine1 ?? "",
      addressLine2: args.addressLine2 ?? "",
      city: args.city ?? "",
      provinceState: args.provinceState ?? "",
      postalCode: args.postalCode ?? "",
      clientStatus: args.clientStatus ?? "active",
      offboardingDate: args.offboardingDate,
      industry: args.industry ?? "",
      tags: args.tags ?? [],
      lastContactDate: args.lastContactDate,
      nextReviewDate: args.nextReviewDate,
      socialLinkedin: args.socialLinkedin ?? "",
      socialFacebook: args.socialFacebook ?? "",
      socialInstagram: args.socialInstagram ?? "",
      socialX: args.socialX ?? "",
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("clients"),
    name: v.optional(v.string()),
    ga4PropertyId: v.optional(v.string()),
    gscSiteUrl: v.optional(v.string()),
    seRankingsProjectId: v.optional(v.string()),
    calLink: v.optional(v.string()),
    notionPageUrl: v.optional(v.string()),
    active: v.optional(v.boolean()),
    websiteUrl: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contractStartDate: v.optional(v.string()),
    contractEndDate: v.optional(v.string()),
    mrr: v.optional(v.number()),
    country: v.optional(v.string()),
    seoHoursAllocated: v.optional(v.number()),
    accountSpecialist: v.optional(v.string()),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.optional(v.string()),
    provinceState: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    clientStatus: v.optional(v.string()),
    offboardingDate: v.optional(v.string()),
    industry: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    lastContactDate: v.optional(v.string()),
    nextReviewDate: v.optional(v.string()),
    socialLinkedin: v.optional(v.string()),
    socialFacebook: v.optional(v.string()),
    socialInstagram: v.optional(v.string()),
    socialX: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        if (key === "name") {
          updates.name = value;
          updates.slug = generateSlug(value as string);
        } else if (key === "gscSiteUrl") {
          updates.gscSiteUrl = normalizeGscUrl(value as string);
        } else if (key === "ga4PropertyId") {
          updates.ga4PropertyId = normalizeGa4Id(value as string);
        } else if (key === "notionPageUrl") {
          updates.notionPageUrl = value;
          updates.notionPageId = extractNotionPageId(value as string);
        } else {
          updates[key] = value;
        }
      }
    }
    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const softDelete = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: false });
  },
});

export const hardDelete = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
