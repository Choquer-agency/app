import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Queries ──

export const getActiveShift = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];
    const entries = await ctx.db
      .query("timesheetEntries")
      .withIndex("by_teamMemberId_and_date", (q) =>
        q.eq("teamMemberId", args.teamMemberId).eq("date", today)
      )
      .take(5);
    // Find the one that's still open (no clockOutTime)
    const active = entries.find((e) => e.clockOutTime === undefined);
    return active ?? null;
  },
});

export const listByMember = query({
  args: {
    teamMemberId: v.id("teamMembers"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("timesheetEntries")
      .withIndex("by_teamMemberId_and_date", (idx) =>
        idx.eq("teamMemberId", args.teamMemberId)
      )
      .order("desc")
      .take(args.limit ?? 200);

    // Filter date range in JS
    let filtered = results;
    if (args.startDate) {
      filtered = filtered.filter((e) => e.date >= args.startDate!);
    }
    if (args.endDate) {
      filtered = filtered.filter((e) => e.date <= args.endDate!);
    }
    return filtered;
  },
});

export const listByDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("timesheetEntries")
      .withIndex("by_date", (q) => q.gte("date", args.startDate))
      .order("desc")
      .take(args.limit ?? 2000);
    return results.filter((e) => e.date <= args.endDate);
  },
});

export const listWithIssues = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let results;
    if (args.startDate) {
      results = await ctx.db
        .query("timesheetEntries")
        .withIndex("by_date", (q) => q.gte("date", args.startDate!))
        .order("desc")
        .take(args.limit ?? 500);
    } else {
      results = await ctx.db
        .query("timesheetEntries")
        .order("desc")
        .take(args.limit ?? 500);
    }

    let filtered = results.filter(
      (e) => e.issues !== undefined && e.issues.length > 0
    );
    if (args.endDate) {
      filtered = filtered.filter((e) => e.date <= args.endDate!);
    }
    return filtered;
  },
});

export const getById = query({
  args: { id: v.id("timesheetEntries") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ── Mutations ──

export const clockIn = mutation({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Check for existing active shift today
    const existing = await ctx.db
      .query("timesheetEntries")
      .withIndex("by_teamMemberId_and_date", (q) =>
        q.eq("teamMemberId", args.teamMemberId).eq("date", today)
      )
      .take(5);

    const active = existing.find((e) => e.clockOutTime === undefined);
    if (active) {
      // Already clocked in — return existing entry
      return active;
    }

    const id = await ctx.db.insert("timesheetEntries", {
      teamMemberId: args.teamMemberId,
      date: today,
      clockInTime: now.toISOString(),
    });
    return await ctx.db.get(id);
  },
});

export const clockOut = mutation({
  args: { id: v.id("timesheetEntries") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry || entry.clockOutTime !== undefined) return null;

    const now = new Date();
    const clockInMs = new Date(entry.clockInTime).getTime();
    const clockOutMs = now.getTime();
    const totalMinutes = Math.floor((clockOutMs - clockInMs) / 60000);
    const breakMinutes = entry.totalBreakMinutes ?? 0;
    const workedMinutes = Math.max(0, totalMinutes - breakMinutes);

    // Detect issues (thresholds match Ollie: 480min=8h, 360min=6h)
    const issues: string[] = [];
    if (workedMinutes > 480) issues.push("OVERTIME_WARNING");

    // Check for long shift without break
    const breaks = await ctx.db
      .query("timesheetBreaks")
      .withIndex("by_timesheetEntryId", (q) =>
        q.eq("timesheetEntryId", args.id)
      )
      .take(50);

    if (workedMinutes > 360 && breaks.length === 0) {
      issues.push("LONG_SHIFT_NO_BREAK");
    }
    if (breaks.some((b) => b.endTime === undefined)) {
      issues.push("OPEN_BREAK");
    }

    await ctx.db.patch(args.id, {
      clockOutTime: now.toISOString(),
      workedMinutes,
      issues: issues.length > 0 ? issues : undefined,
    });
    return await ctx.db.get(args.id);
  },
});

export const markSickDay = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    date: v.string(),
    isHalf: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if entry already exists for this date
    const existing = await ctx.db
      .query("timesheetEntries")
      .withIndex("by_teamMemberId_and_date", (q) =>
        q.eq("teamMemberId", args.teamMemberId).eq("date", args.date)
      )
      .take(1);

    if (existing.length > 0) {
      // Update existing entry to mark as sick
      await ctx.db.patch(existing[0]._id, {
        isSickDay: !args.isHalf,
        isHalfSickDay: args.isHalf ?? false,
      });
      return await ctx.db.get(existing[0]._id);
    }

    // Create new sick day entry
    const id = await ctx.db.insert("timesheetEntries", {
      teamMemberId: args.teamMemberId,
      date: args.date,
      clockInTime: new Date().toISOString(),
      isSickDay: !args.isHalf,
      isHalfSickDay: args.isHalf ?? false,
      workedMinutes: 0,
    });
    return await ctx.db.get(id);
  },
});

export const markVacationDay = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("timesheetEntries", {
      teamMemberId: args.teamMemberId,
      date: args.date,
      clockInTime: new Date().toISOString(),
      isVacation: true,
      workedMinutes: 0,
    });
    return await ctx.db.get(id);
  },
});

export const adminEdit = mutation({
  args: {
    id: v.id("timesheetEntries"),
    clockInTime: v.optional(v.string()),
    clockOutTime: v.optional(v.string()),
    note: v.optional(v.string()),
    isSickDay: v.optional(v.boolean()),
    isHalfSickDay: v.optional(v.boolean()),
    isVacation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) return null;

    const updates: Record<string, unknown> = {};
    const { id, ...fields } = args;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    // Recompute workedMinutes if times changed
    const clockIn = args.clockInTime ?? existing.clockInTime;
    const clockOut = args.clockOutTime ?? existing.clockOutTime;
    if (clockOut) {
      const totalMinutes = Math.floor(
        (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000
      );
      const breakMinutes = existing.totalBreakMinutes ?? 0;
      updates.workedMinutes = Math.max(0, totalMinutes - breakMinutes);
    }

    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

// Delete a single entry (and its breaks)
export const remove = mutation({
  args: { id: v.id("timesheetEntries") },
  handler: async (ctx, args) => {
    // Delete associated breaks first
    const breaks = await ctx.db
      .query("timesheetBreaks")
      .withIndex("by_timesheetEntryId", (q) =>
        q.eq("timesheetEntryId", args.id)
      )
      .take(100);
    for (const b of breaks) {
      await ctx.db.delete(b._id);
    }
    await ctx.db.delete(args.id);
  },
});

// Batch delete entries by date range (for re-migration)
export const removeBatch = mutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("timesheetEntries")
      .take(args.limit ?? 50);
    for (const entry of entries) {
      const breaks = await ctx.db
        .query("timesheetBreaks")
        .withIndex("by_timesheetEntryId", (q) =>
          q.eq("timesheetEntryId", entry._id)
        )
        .take(100);
      for (const b of breaks) {
        await ctx.db.delete(b._id);
      }
      await ctx.db.delete(entry._id);
    }
    return entries.length;
  },
});

// Used by migration script to insert historical entries
export const insertHistorical = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    date: v.string(),
    clockInTime: v.string(),
    clockOutTime: v.optional(v.string()),
    totalBreakMinutes: v.optional(v.number()),
    workedMinutes: v.optional(v.number()),
    isSickDay: v.optional(v.boolean()),
    isHalfSickDay: v.optional(v.boolean()),
    isVacation: v.optional(v.boolean()),
    note: v.optional(v.string()),
    issues: v.optional(v.array(v.string())),
    pendingApproval: v.optional(v.boolean()),
    sickHoursUsed: v.optional(v.number()),
    changeRequest: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate (idempotent)
    const existing = await ctx.db
      .query("timesheetEntries")
      .withIndex("by_teamMemberId_and_date", (q) =>
        q.eq("teamMemberId", args.teamMemberId).eq("date", args.date)
      )
      .take(1);

    if (existing.length > 0) return existing[0];

    const id = await ctx.db.insert("timesheetEntries", {
      teamMemberId: args.teamMemberId,
      date: args.date,
      clockInTime: args.clockInTime,
      clockOutTime: args.clockOutTime,
      totalBreakMinutes: args.totalBreakMinutes,
      workedMinutes: args.workedMinutes,
      isSickDay: args.isSickDay,
      isHalfSickDay: args.isHalfSickDay,
      isVacation: args.isVacation,
      note: args.note,
      issues: args.issues,
      pendingApproval: args.pendingApproval,
      sickHoursUsed: args.sickHoursUsed,
      changeRequest: args.changeRequest,
    });
    return await ctx.db.get(id);
  },
});
