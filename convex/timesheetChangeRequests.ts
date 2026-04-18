import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ── Queries ──

export const listByMember = query({
  args: {
    teamMemberId: v.id("teamMembers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("timesheetChangeRequests")
      .withIndex("by_teamMemberId", (q) =>
        q.eq("teamMemberId", args.teamMemberId)
      )
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("timesheetChangeRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(100);
  },
});

// ── Mutations ──

export const create = mutation({
  args: {
    timesheetEntryId: v.id("timesheetEntries"),
    teamMemberId: v.id("teamMembers"),
    proposedClockIn: v.string(),
    proposedClockOut: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.timesheetEntryId);
    if (!entry) throw new Error("Timesheet entry not found");

    // Duplicate protection: return existing pending request instead of creating another
    const existing = await ctx.db
      .query("timesheetChangeRequests")
      .withIndex("by_timesheetEntryId", (q) =>
        q.eq("timesheetEntryId", args.timesheetEntryId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
    if (existing) return existing;

    // Compute minutes delta
    let minutesDelta: number | undefined;
    if (args.proposedClockOut && entry.clockOutTime) {
      const originalMinutes = Math.round(
        (new Date(entry.clockOutTime).getTime() -
          new Date(entry.clockInTime).getTime()) /
          60000
      );
      const proposedMinutes = Math.round(
        (new Date(args.proposedClockOut).getTime() -
          new Date(args.proposedClockIn).getTime()) /
          60000
      );
      minutesDelta = proposedMinutes - originalMinutes;
    }

    const id = await ctx.db.insert("timesheetChangeRequests", {
      timesheetEntryId: args.timesheetEntryId,
      teamMemberId: args.teamMemberId,
      originalClockIn: entry.clockInTime,
      originalClockOut: entry.clockOutTime,
      proposedClockIn: args.proposedClockIn,
      proposedClockOut: args.proposedClockOut,
      reason: args.reason,
      status: "pending",
      minutesDelta,
    });

    // Mark the entry so the "fix your timecard" modal won't re-trigger
    await ctx.db.patch(args.timesheetEntryId, {
      changeRequest: { status: "pending", changeRequestId: id },
    });

    return await ctx.db.get(id);
  },
});

export const approve = mutation({
  args: {
    id: v.id("timesheetChangeRequests"),
    reviewedById: v.id("teamMembers"),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request || request.status !== "pending") return null;

    // Apply changes to the original timesheet entry
    const entry = await ctx.db.get(request.timesheetEntryId);
    if (entry) {
      const updates: Record<string, unknown> = {
        clockInTime: request.proposedClockIn,
      };
      if (request.proposedClockOut) {
        updates.clockOutTime = request.proposedClockOut;
        // Recompute workedMinutes
        const totalMinutes = Math.round(
          (new Date(request.proposedClockOut).getTime() -
            new Date(request.proposedClockIn).getTime()) /
            60000
        );
        const breakMinutes = entry.totalBreakMinutes ?? 0;
        updates.workedMinutes = Math.max(0, totalMinutes - breakMinutes);
      }
      await ctx.db.patch(request.timesheetEntryId, updates);
    }

    await ctx.db.patch(args.id, {
      status: "approved",
      reviewedById: args.reviewedById,
      reviewedAt: new Date().toISOString(),
      reviewNote: args.reviewNote,
    });
    return await ctx.db.get(args.id);
  },
});

// One-time cleanup: deduplicate pending change requests per entry.
// Keeps the most recent pending request, auto-denies the rest.
export const deduplicatePending = mutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("timesheetChangeRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200);

    // Group by timesheetEntryId, keep first (most recent), deny the rest
    const seen = new Set<string>();
    let closed = 0;
    for (const req of pending) {
      const key = req.timesheetEntryId;
      if (!seen.has(key)) {
        seen.add(key);
        // Ensure the entry has the changeRequest marker
        await ctx.db.patch(req.timesheetEntryId, {
          changeRequest: { status: "pending", changeRequestId: req._id },
        });
        continue;
      }
      // Duplicate — auto-deny
      await ctx.db.patch(req._id, {
        status: "denied",
        reviewNote: "Auto-closed duplicate",
        reviewedAt: new Date().toISOString(),
      });
      closed++;
    }
    return { closed, uniqueEntries: seen.size };
  },
});

export const deny = mutation({
  args: {
    id: v.id("timesheetChangeRequests"),
    reviewedById: v.id("teamMembers"),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request || request.status !== "pending") return null;

    await ctx.db.patch(args.id, {
      status: "denied",
      reviewedById: args.reviewedById,
      reviewedAt: new Date().toISOString(),
      reviewNote: args.reviewNote,
    });

    // Clear the changeRequest marker so the user is prompted to submit a new fix
    await ctx.db.patch(request.timesheetEntryId, { changeRequest: undefined });

    return await ctx.db.get(args.id);
  },
});
