import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const logBatch = mutation({
  args: {
    events: v.array(
      v.object({
        clientSlug: v.string(),
        eventType: v.string(),
        eventDetail: v.optional(v.any()),
        sessionId: v.optional(v.string()),
        deviceType: v.optional(v.string()),
        referrer: v.optional(v.string()),
        visitorId: v.optional(v.id("visitors")),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const event of args.events) {
      await ctx.db.insert("activityLog", {
        clientSlug: event.clientSlug,
        eventType: event.eventType,
        eventDetail: event.eventDetail,
        sessionId: event.sessionId,
        deviceType: event.deviceType,
        referrer: event.referrer,
        visitorId: event.visitorId,
      });
    }
  },
});

export const listByClient = query({
  args: {
    clientSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activityLog")
      .withIndex("by_client", (q) => q.eq("clientSlug", args.clientSlug))
      .order("desc")
      .take(args.limit ?? 200);
  },
});

export const getEngagementSummary = query({
  args: {},
  handler: async (ctx) => {
    const allLogs = await ctx.db.query("activityLog").order("desc").take(10000);
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    const byClient: Record<string, { lastVisit: number; visits7d: number; visits30d: number; ctaClicks: number; sessions30d: Set<string> }> = {};

    for (const log of allLogs) {
      const slug = log.clientSlug;
      if (!byClient[slug]) {
        byClient[slug] = { lastVisit: 0, visits7d: 0, visits30d: 0, ctaClicks: 0, sessions30d: new Set() };
      }
      const entry = byClient[slug];
      const age = now - log._creationTime;

      if (log._creationTime > entry.lastVisit) entry.lastVisit = log._creationTime;
      if (log.eventType === "page_view" && age < sevenDays) entry.visits7d++;
      if (log.eventType === "page_view" && age < thirtyDays) entry.visits30d++;
      if (log.eventType === "cta_click") entry.ctaClicks++;
      if (age < thirtyDays && log.sessionId) entry.sessions30d.add(log.sessionId);
    }

    return Object.entries(byClient).map(([slug, data]) => ({
      client_slug: slug,
      last_visit: new Date(data.lastVisit).toISOString(),
      visits_7d: data.visits7d,
      visits_30d: data.visits30d,
      cta_clicks: data.ctaClicks,
      sessions_30d: data.sessions30d.size,
    }));
  },
});
