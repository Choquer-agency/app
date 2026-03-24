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
    return running ?? null;
  },
});

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
        const durationSeconds = Math.round((endMs - startMs) / 1000);
        await ctx.db.patch(entry._id, {
          endTime: now,
          durationSeconds,
        });
      }
    }

    // Insert new running timer
    const id = await ctx.db.insert("timeEntries", {
      ticketId: args.ticketId,
      teamMemberId: args.teamMemberId,
      startTime: now,
    });
    return await ctx.db.get(id);
  },
});

export const stop = mutation({
  args: { id: v.id("timeEntries") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry || entry.endTime !== undefined) return null;

    const now = new Date().toISOString();
    const startMs = new Date(entry.startTime).getTime();
    const endMs = new Date(now).getTime();
    const durationSeconds = Math.round((endMs - startMs) / 1000);

    await ctx.db.patch(args.id, {
      endTime: now,
      durationSeconds,
    });
    return await ctx.db.get(args.id);
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
    const durationSeconds = Math.round((endMs - startMs) / 1000);

    const id = await ctx.db.insert("timeEntries", {
      ticketId: args.ticketId,
      teamMemberId: args.teamMemberId,
      startTime: args.startTime,
      endTime: args.endTime,
      durationSeconds,
      isManual: true,
      note: args.note ?? "",
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
      durationSeconds = Math.round((endMs - startMs) / 1000);
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
