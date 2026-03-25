import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Queries ──

export const listByEntry = query({
  args: { timesheetEntryId: v.id("timesheetEntries") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("timesheetBreaks")
      .withIndex("by_timesheetEntryId", (q) =>
        q.eq("timesheetEntryId", args.timesheetEntryId)
      )
      .take(50);
  },
});

export const getActiveBreak = query({
  args: { timesheetEntryId: v.id("timesheetEntries") },
  handler: async (ctx, args) => {
    const breaks = await ctx.db
      .query("timesheetBreaks")
      .withIndex("by_timesheetEntryId", (q) =>
        q.eq("timesheetEntryId", args.timesheetEntryId)
      )
      .take(50);
    const active = breaks.find((b) => b.endTime === undefined);
    return active ?? null;
  },
});

// ── Mutations ──

export const startBreak = mutation({
  args: { timesheetEntryId: v.id("timesheetEntries") },
  handler: async (ctx, args) => {
    // Verify the entry exists and is still active (not clocked out)
    const entry = await ctx.db.get(args.timesheetEntryId);
    if (!entry || entry.clockOutTime !== undefined) return null;

    // Check for existing open break
    const breaks = await ctx.db
      .query("timesheetBreaks")
      .withIndex("by_timesheetEntryId", (q) =>
        q.eq("timesheetEntryId", args.timesheetEntryId)
      )
      .take(50);

    const openBreak = breaks.find((b) => b.endTime === undefined);
    if (openBreak) return openBreak; // Already on break

    const id = await ctx.db.insert("timesheetBreaks", {
      timesheetEntryId: args.timesheetEntryId,
      startTime: new Date().toISOString(),
      breakType: "unpaid",
    });
    return await ctx.db.get(id);
  },
});

export const endBreak = mutation({
  args: { id: v.id("timesheetBreaks") },
  handler: async (ctx, args) => {
    const brk = await ctx.db.get(args.id);
    if (!brk || brk.endTime !== undefined) return null;

    const now = new Date();
    const startMs = new Date(brk.startTime).getTime();
    const durationMinutes = Math.round((now.getTime() - startMs) / 60000);

    await ctx.db.patch(args.id, {
      endTime: now.toISOString(),
      durationMinutes,
    });

    // Update the parent entry's totalBreakMinutes
    const allBreaks = await ctx.db
      .query("timesheetBreaks")
      .withIndex("by_timesheetEntryId", (q) =>
        q.eq("timesheetEntryId", brk.timesheetEntryId)
      )
      .take(50);

    let totalBreakMinutes = 0;
    for (const b of allBreaks) {
      if (b._id === args.id) {
        totalBreakMinutes += durationMinutes;
      } else if (b.durationMinutes) {
        totalBreakMinutes += b.durationMinutes;
      }
    }

    await ctx.db.patch(brk.timesheetEntryId, { totalBreakMinutes });

    return await ctx.db.get(args.id);
  },
});

// Used by migration script
export const insertHistorical = mutation({
  args: {
    timesheetEntryId: v.id("timesheetEntries"),
    startTime: v.string(),
    endTime: v.optional(v.string()),
    breakType: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("timesheetBreaks", {
      timesheetEntryId: args.timesheetEntryId,
      startTime: args.startTime,
      endTime: args.endTime,
      breakType: args.breakType ?? "unpaid",
      durationMinutes: args.durationMinutes,
    });
    return await ctx.db.get(id);
  },
});
