import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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

    // Fetch team members once so we can fall back to client.accountSpecialist
    // when the entry has no explicit specialistId.
    const allMembers = await ctx.db.query("teamMembers").collect();
    const memberByName = new Map<string, typeof allMembers[number]>();
    for (const m of allMembers) memberByName.set(m.name, m);

    // Pre-fetch service tickets matching this category+month so we can include
    // serviceTicketId on each entry without a per-row client roundtrip.
    let ticketByClientId = new Map<string, { _id: Id<"tickets"> }>();
    if (args.category && args.month) {
      const categoryLabel =
        args.category === "google_ads"
          ? "Google Ads"
          : args.category === "seo"
            ? "SEO"
            : "Retainer";
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];
      const [y, m] = args.month.split("-").map(Number);
      const monthLabel = `${monthNames[(m ?? 1) - 1]} ${y}`;
      const expectedTitle = `${categoryLabel} — ${monthLabel}`;
      const serviceTickets = await ctx.db
        .query("tickets")
        .withIndex("by_service_category", (q) =>
          q.eq("serviceCategory", args.category!)
        )
        .collect();
      for (const t of serviceTickets) {
        if (t.clientId && t.title === expectedTitle && t.archived !== true) {
          ticketByClientId.set(String(t.clientId), { _id: t._id });
        }
      }
    }

    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const client = await ctx.db.get(entry.clientId);
        const clientPkg = await ctx.db.get(entry.clientPackageId);
        const pkg = clientPkg ? await ctx.db.get(clientPkg.packageId) : null;

        let specialist = entry.specialistId
          ? await ctx.db.get(entry.specialistId)
          : null;
        if (!specialist && client?.accountSpecialist) {
          specialist = memberByName.get(client.accountSpecialist) ?? null;
        }

        const serviceTicket = ticketByClientId.get(String(entry.clientId));

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
          serviceTicketId: serviceTicket?._id ?? null,
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

export const getMySummary = query({
  args: {
    specialistId: v.id("teamMembers"),
    month: v.string(),
  },
  handler: async (ctx, args) => {
    const categories = ["seo", "google_ads"];
    const allEntries = [];
    for (const category of categories) {
      const entries = await ctx.db
        .query("serviceBoardEntries")
        .withIndex("by_category_month", (q) =>
          q.eq("category", category).eq("month", args.month)
        )
        .collect();
      allEntries.push(...entries);
    }

    const myEntries = allEntries.filter(
      (e) => e.specialistId === args.specialistId
    );

    if (myEntries.length === 0) return [];

    // Get client names
    const clientIds = [...new Set(myEntries.map((e) => e.clientId))];
    const clientMap = new Map<string, string>();
    for (const clientId of clientIds) {
      const client = await ctx.db.get(clientId);
      if (client) clientMap.set(clientId.toString(), (client as any).name ?? "");
    }

    // Group by category
    const byCategory = new Map<
      string,
      {
        total: number;
        completed: number;
        clients: Array<{ id: string; name: string; status: string }>;
      }
    >();

    for (const entry of myEntries) {
      const cat = entry.category;
      if (!byCategory.has(cat)) {
        byCategory.set(cat, { total: 0, completed: 0, clients: [] });
      }
      const group = byCategory.get(cat)!;
      group.total++;
      if (entry.status === "email_sent") {
        group.completed++;
      }
      group.clients.push({
        id: entry.clientId.toString(),
        name: clientMap.get(entry.clientId.toString()) || "Unknown",
        status: entry.status ?? "needs_attention",
      });
    }

    const monthDate = new Date(args.month + "T12:00:00");
    const monthLabel = monthDate.toLocaleString("en-US", { month: "long" });

    return Array.from(byCategory.entries()).map(([category, data]) => ({
      category,
      categoryLabel:
        category === "google_ads"
          ? "Google Ads"
          : category === "seo"
            ? "SEO"
            : "Retainer",
      month: monthLabel,
      total: data.total,
      completed: data.completed,
      clients: data.clients,
    }));
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
