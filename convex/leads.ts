import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    // Sort by creation time descending (newest first)
    leads.sort((a, b) => b._creationTime - a._creationTime);
    return leads;
  },
});

export const get = query({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    company: v.string(),
    contactName: v.optional(v.string()),
    contactRole: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    website: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const status = args.status ?? "new";
    const id = await ctx.db.insert("leads", {
      company: args.company,
      contactName: args.contactName ?? "",
      contactRole: args.contactRole ?? "",
      contactEmail: args.contactEmail ?? "",
      contactPhone: args.contactPhone ?? "",
      website: args.website ?? "",
      status,
      notes: args.notes ?? "",
      source: args.source ?? "",
      statusChangedAt: now,
      statusHistory: [{ status, at: now }],
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("leads"),
    company: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactRole: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    website: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.optional(v.string()),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const existing = await ctx.db.get(id);
    if (!existing) return null;

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    // Track status history when status actually changes.
    if (typeof fields.status === "string" && fields.status !== existing.status) {
      const now = Date.now();
      patch.statusChangedAt = now;
      const history = existing.statusHistory ?? [];
      patch.statusHistory = [...history, { status: fields.status, at: now }];
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

/** Convert a lead into a full client record. Returns the new client ID. */
export const convertToClient = mutation({
  args: {
    id: v.id("leads"),
    // Overrides / additions beyond the lead data (required for a complete client)
    name: v.string(),
    websiteUrl: v.string(),
    contactName: v.string(),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
    country: v.string(), // "US" | "CA"
    industry: v.optional(v.string()),
    accountSpecialist: v.optional(v.string()),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.optional(v.string()),
    provinceState: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    // Integration IDs
    ga4PropertyId: v.optional(v.string()),
    gscSiteUrl: v.optional(v.string()),
    googleAdsCustomerId: v.optional(v.string()),
    notionPageUrl: v.optional(v.string()),
    calLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new Error("Lead not found");

    const baseSlug = (args.name || "client")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "client";

    let slug = baseSlug;
    let i = 2;
    while (true) {
      const existing = await ctx.db
        .query("clients")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
        .catch(() => null);
      if (!existing) break;
      slug = `${baseSlug}-${i}`;
      i++;
    }

    const clientId = await ctx.db.insert("clients", {
      name: args.name,
      slug,
      active: true,
      websiteUrl: args.websiteUrl,
      contactName: args.contactName,
      contactEmail: args.contactEmail,
      contactPhone: args.contactPhone || undefined,
      country: args.country,
      industry: args.industry || undefined,
      accountSpecialist: args.accountSpecialist || undefined,
      addressLine1: args.addressLine1 || undefined,
      addressLine2: args.addressLine2 || undefined,
      city: args.city || undefined,
      provinceState: args.provinceState || undefined,
      postalCode: args.postalCode || undefined,
      ga4PropertyId: args.ga4PropertyId || undefined,
      gscSiteUrl: args.gscSiteUrl || undefined,
      googleAdsCustomerId: args.googleAdsCustomerId || undefined,
      notionPageUrl: args.notionPageUrl || undefined,
      calLink: args.calLink || undefined,
      clientStatus: "new",
    });

    const now = Date.now();
    await ctx.db.patch(args.id, {
      qualification: "converted",
      qualificationChangedAt: now,
    });

    return { clientId, slug };
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Meta Ads integration
// ────────────────────────────────────────────────────────────────────────────

const META_FIELDS = v.object({
  metaCampaignId: v.optional(v.string()),
  metaAdSetId: v.optional(v.string()),
  metaAdId: v.optional(v.string()),
  metaFormId: v.optional(v.string()),
  metaLeadgenId: v.optional(v.string()),
  metaPageId: v.optional(v.string()),
  fbclid: v.optional(v.string()),
  fbc: v.optional(v.string()),
  fbp: v.optional(v.string()),
  clientUserAgent: v.optional(v.string()),
  clientIpAddress: v.optional(v.string()),
  leadCapturedAt: v.optional(v.number()),
});

/** Upsert a lead coming from the Meta Lead Ads webhook. Dedups on metaLeadgenId. */
export const createFromMeta = mutation({
  args: {
    company: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    meta: META_FIELDS,
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Dedup: if a lead with this leadgen ID already exists, return it.
    if (args.meta.metaLeadgenId) {
      const existing = await ctx.db
        .query("leads")
        .withIndex("by_leadgen_id", (q) => q.eq("metaLeadgenId", args.meta.metaLeadgenId))
        .first();
      if (existing) return existing;
    }

    const id = await ctx.db.insert("leads", {
      company: args.company ?? args.contactName ?? "Meta Lead",
      contactName: args.contactName ?? "",
      contactRole: "",
      contactEmail: args.contactEmail ?? "",
      contactPhone: args.contactPhone ?? "",
      website: "",
      status: "new",
      notes: args.notes ?? "",
      source: "meta_ads",
      statusChangedAt: now,
      statusHistory: [{ status: "new", at: now }],
      ...args.meta,
    });

    // Fire the "Lead" event to Meta (automatic on lead creation from Meta).
    await ctx.scheduler.runAfter(0, internal.leadsMeta.dispatchMetaEvent, {
      leadId: id,
      eventName: "Lead",
    });

    return await ctx.db.get(id);
  },
});

/** Set the qualification funnel state. Fires Meta CAPI event automatically. */
export const updateQualification = mutation({
  args: {
    id: v.id("leads"),
    qualification: v.union(
      v.literal("qualified"),
      v.literal("unqualified"),
      v.literal("converted"),
      v.literal("unset")
    ),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;

    const now = Date.now();
    const patch: Record<string, unknown> = {
      qualificationChangedAt: now,
    };

    if (args.qualification === "unset") {
      patch.qualification = undefined;
    } else {
      patch.qualification = args.qualification;
    }

    if (typeof args.value === "number") patch.value = args.value;
    if (args.currency) patch.currency = args.currency;

    await ctx.db.patch(args.id, patch);

    // Map qualification → Meta event and schedule dispatch.
    let eventName: "QualifiedLead" | "Purchase" | null = null;
    if (args.qualification === "qualified") eventName = "QualifiedLead";
    else if (args.qualification === "converted") eventName = "Purchase";

    if (eventName) {
      await ctx.scheduler.runAfter(0, internal.leadsMeta.dispatchMetaEvent, {
        leadId: args.id,
        eventName,
      });
    }

    return await ctx.db.get(args.id);
  },
});

/** Internal query used by the Meta dispatch action (actions can't access ctx.db). */
export const getLeadForDispatch = internalQuery({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Internal mutation used by the Meta event action to record dispatch results. */
export const recordMetaEvent = internalMutation({
  args: {
    leadId: v.id("leads"),
    eventName: v.string(),
    eventId: v.string(),
    sentAt: v.number(),
    status: v.string(),
    fbTraceId: v.optional(v.string()),
    error: v.optional(v.string()),
    testMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return;
    const existing = lead.metaEventsSent ?? [];
    // Replace any prior entry with the same eventId (retry semantics).
    const filtered = existing.filter((e) => e.eventId !== args.eventId);
    const entry = {
      eventName: args.eventName,
      eventId: args.eventId,
      sentAt: args.sentAt,
      status: args.status,
      ...(args.fbTraceId ? { fbTraceId: args.fbTraceId } : {}),
      ...(args.error ? { error: args.error } : {}),
      ...(typeof args.testMode === "boolean" ? { testMode: args.testMode } : {}),
    };
    await ctx.db.patch(args.leadId, { metaEventsSent: [...filtered, entry] });
  },
});

/** Backfill helper — fire Lead event for a manually-created Meta lead. */
export const resendMetaEvent = mutation({
  args: {
    id: v.id("leads"),
    eventName: v.union(v.literal("Lead"), v.literal("QualifiedLead"), v.literal("Purchase")),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.leadsMeta.dispatchMetaEvent, {
      leadId: args.id,
      eventName: args.eventName,
    });
    return { scheduled: true };
  },
});

// Re-export the Doc<"leads"> type helper if needed by callers.
export type LeadId = Id<"leads">;
