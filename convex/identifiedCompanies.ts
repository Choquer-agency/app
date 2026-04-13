import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const upsertByDomain = mutation({
  args: {
    name: v.string(),
    domain: v.optional(v.string()),
    industry: v.optional(v.string()),
    employeeCount: v.optional(v.string()),
    city: v.optional(v.string()),
    region: v.optional(v.string()),
    country: v.optional(v.string()),
    description: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    // Try to find existing by domain
    if (args.domain) {
      const existing = await ctx.db
        .query("identifiedCompanies")
        .withIndex("by_domain", (q) => q.eq("domain", args.domain))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: args.name,
          industry: args.industry ?? existing.industry,
          employeeCount: args.employeeCount ?? existing.employeeCount,
          city: args.city ?? existing.city,
          region: args.region ?? existing.region,
          country: args.country ?? existing.country,
          description: args.description ?? existing.description,
          linkedinUrl: args.linkedinUrl ?? existing.linkedinUrl,
          logoUrl: args.logoUrl ?? existing.logoUrl,
          source: args.source,
          lastEnrichedAt: new Date().toISOString(),
        });
        return existing._id;
      }
    }

    // Create new
    return await ctx.db.insert("identifiedCompanies", {
      name: args.name,
      domain: args.domain,
      industry: args.industry,
      employeeCount: args.employeeCount,
      city: args.city,
      region: args.region,
      country: args.country,
      description: args.description,
      linkedinUrl: args.linkedinUrl,
      logoUrl: args.logoUrl,
      source: args.source,
      lastEnrichedAt: new Date().toISOString(),
    });
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("identifiedCompanies")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const get = query({
  args: { id: v.id("identifiedCompanies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const promoteToLead = mutation({
  args: {
    id: v.id("identifiedCompanies"),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) throw new Error("Company not found");
    if (company.leadId) throw new Error("Already promoted to lead");

    // Create a lead from this company
    const leadId = await ctx.db.insert("leads", {
      company: company.name,
      contactName: "",
      contactRole: "",
      contactEmail: "",
      website: company.domain ? `https://${company.domain}` : "",
      status: "new",
      notes: `Identified via website visitor tracking. Industry: ${company.industry || "Unknown"}. Size: ${company.employeeCount || "Unknown"}.`,
      source: "visitor_id",
    });

    // Link back
    await ctx.db.patch(args.id, { leadId });

    return leadId;
  },
});
