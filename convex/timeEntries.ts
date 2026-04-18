import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTicket = query({
  args: {
    ticketId: v.id("tickets"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("timeEntries")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listByMember = query({
  args: {
    teamMemberId: v.id("teamMembers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("timeEntries")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const getRunning = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .order("desc")
      .take(50);
    // Filter in JS for endTime === undefined (running timers)
    const running = entries.find((e) => e.endTime === undefined);
    if (!running) return null;

    // Enrich with ticket and client info
    const ticket = await ctx.db.get(running.ticketId);
    let clientName: string | undefined;
    if (ticket?.clientId) {
      const client = await ctx.db.get(ticket.clientId);
      clientName = client?.name;
    }

    return {
      ...running,
      ticketNumber: ticket?.ticketNumber ?? "",
      ticketTitle: ticket?.title ?? "",
      clientName: clientName ?? null,
      serviceCategory: ticket?.serviceCategory ?? null,
      clientId: ticket?.clientId ?? null,
    };
  },
});

// Cascade order used to identify a client's "primary" package category for rate lookup.
// Website work is billed at 1.0x; everything else uses the team member's timeMultiplier.
const RATE_CASCADE_ORDER = [
  "website",
  "seo",
  "retainer",
  "google_ads",
  "blog",
  "hosting",
  "ai",
  "ai_chat",
] as const;

async function computeEntryRate(
  ctx: { db: any },
  ticketId: Id<"tickets">,
  teamMemberId: Id<"teamMembers">
): Promise<number> {
  const member = await ctx.db.get(teamMemberId);
  const multiplier = member?.timeMultiplier ?? 1.0;
  if (multiplier === 1.0) return 1.0;

  const ticket = await ctx.db.get(ticketId);
  const clientId = ticket?.clientId;
  if (!clientId) return multiplier;

  const assignments = await ctx.db
    .query("clientPackages")
    .withIndex("by_client", (q: any) => q.eq("clientId", clientId))
    .collect();
  const active = assignments.filter((cp: any) => cp.active && !cp.isOneTime);
  if (active.length === 0) return multiplier;

  // Find the highest-priority package category (lowest cascade index)
  let bestRank = RATE_CASCADE_ORDER.length;
  let primaryCategory: string | undefined;
  for (const cp of active) {
    const pkg = await ctx.db.get(cp.packageId);
    const category = pkg?.category ?? "other";
    const rank = (RATE_CASCADE_ORDER as readonly string[]).indexOf(category);
    const effectiveRank = rank === -1 ? RATE_CASCADE_ORDER.length : rank;
    if (effectiveRank < bestRank) {
      bestRank = effectiveRank;
      primaryCategory = category;
    }
  }

  return primaryCategory === "website" ? 1.0 : multiplier;
}

export const start = mutation({
  args: {
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    // Stop any running timer for this member first
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .order("desc")
      .take(50);

    const now = new Date().toISOString();
    for (const entry of entries) {
      if (entry.endTime === undefined) {
        const startMs = new Date(entry.startTime).getTime();
        const endMs = new Date(now).getTime();
        const wallSeconds = Math.round((endMs - startMs) / 1000);
        const rate = entry.rate ?? 1.0;
        const durationSeconds = Math.round(wallSeconds * rate);
        await ctx.db.patch(entry._id, {
          endTime: now,
          durationSeconds,
        });
      }
    }

    const rate = await computeEntryRate(ctx, args.ticketId, args.teamMemberId);

    // Insert new running timer
    const id = await ctx.db.insert("timeEntries", {
      ticketId: args.ticketId,
      teamMemberId: args.teamMemberId,
      startTime: now,
      rate,
    });
    return await ctx.db.get(id);
  },
});

export const stop = mutation({
  args: {
    id: v.id("timeEntries"),
    teamMemberId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry || entry.endTime !== undefined) return null;
    if (entry.teamMemberId !== args.teamMemberId) {
      throw new Error("You can only stop your own timer.");
    }

    const now = new Date().toISOString();
    const startMs = new Date(entry.startTime).getTime();
    const endMs = new Date(now).getTime();
    const wallSeconds = Math.round((endMs - startMs) / 1000);
    const rate = entry.rate ?? 1.0;
    const durationSeconds = Math.round(wallSeconds * rate);

    await ctx.db.patch(args.id, {
      endTime: now,
      durationSeconds,
    });
    return await ctx.db.get(args.id);
  },
});

// Stop any running timer for a team member (used when starting a break)
export const stopByMember = mutation({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .order("desc")
      .take(50);

    const running = entries.find((e) => e.endTime === undefined);
    if (!running) return null;

    const now = new Date().toISOString();
    const startMs = new Date(running.startTime).getTime();
    const endMs = new Date(now).getTime();
    const wallSeconds = Math.round((endMs - startMs) / 1000);
    const rate = running.rate ?? 1.0;
    const durationSeconds = Math.round(wallSeconds * rate);

    await ctx.db.patch(running._id, {
      endTime: now,
      durationSeconds,
    });

    // Return the ticketId so the caller can offer to resume it
    const ticket = await ctx.db.get(running.ticketId);
    return {
      ticketId: running.ticketId,
      ticketNumber: ticket?.ticketNumber ?? "",
    };
  },
});

export const create = mutation({
  args: {
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
    startTime: v.string(),
    endTime: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startMs = new Date(args.startTime).getTime();
    const endMs = new Date(args.endTime).getTime();
    const wallSeconds = Math.round((endMs - startMs) / 1000);
    const rate = await computeEntryRate(ctx, args.ticketId, args.teamMemberId);
    const durationSeconds = Math.round(wallSeconds * rate);

    const id = await ctx.db.insert("timeEntries", {
      ticketId: args.ticketId,
      teamMemberId: args.teamMemberId,
      startTime: args.startTime,
      endTime: args.endTime,
      durationSeconds,
      isManual: true,
      note: args.note ?? "",
      rate,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("timeEntries"),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;

    const startTime = args.startTime ?? existing.startTime;
    const endTime = args.endTime ?? existing.endTime;
    const note = args.note ?? existing.note;

    let durationSeconds = existing.durationSeconds;
    if (endTime) {
      const startMs = new Date(startTime).getTime();
      const endMs = new Date(endTime).getTime();
      const wallSeconds = Math.round((endMs - startMs) / 1000);
      const rate = existing.rate ?? 1.0;
      durationSeconds = Math.round(wallSeconds * rate);
    }

    await ctx.db.patch(args.id, {
      startTime,
      endTime,
      durationSeconds,
      note,
    });
    return await ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("timeEntries") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// List all time entries (for report aggregation)
export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("timeEntries")
      .order("desc")
      .take(args.limit ?? 5000);
  },
});

// List running timers for a single team member.
// There is intentionally no cross-team "list all running timers" query —
// running timers are private per user. Runaway detection on the server
// iterates team members and calls getRunning per member.
export const listRunningByMember = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .order("desc")
      .take(50);
    return entries.filter((e) => e.endTime === undefined);
  },
});
