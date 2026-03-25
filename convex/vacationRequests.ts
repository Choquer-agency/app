import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { api } from "./_generated/api";

// ── Queries ──

export const listByMember = query({
  args: {
    teamMemberId: v.id("teamMembers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vacationRequests")
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
      .query("vacationRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(100);
  },
});

export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vacationRequests")
      .order("desc")
      .take(args.limit ?? 200);
  },
});

// ── Mutations ──

export const create = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    startDate: v.string(),
    endDate: v.string(),
    totalDays: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate: no past dates
    const today = new Date().toISOString().split("T")[0];
    if (args.startDate < today) {
      throw new Error("Cannot request vacation in the past");
    }
    if (args.endDate < args.startDate) {
      throw new Error("End date must be on or after start date");
    }

    // Check for overlapping approved/pending requests
    const existing = await ctx.db
      .query("vacationRequests")
      .withIndex("by_teamMemberId", (q) =>
        q.eq("teamMemberId", args.teamMemberId)
      )
      .take(200);

    const overlapping = existing.find(
      (r) =>
        r.status !== "denied" &&
        r.startDate <= args.endDate &&
        r.endDate >= args.startDate
    );
    if (overlapping) {
      throw new Error("Vacation request overlaps with an existing request");
    }

    const id = await ctx.db.insert("vacationRequests", {
      teamMemberId: args.teamMemberId,
      startDate: args.startDate,
      endDate: args.endDate,
      totalDays: args.totalDays,
      reason: args.reason,
      status: "pending",
    });
    return await ctx.db.get(id);
  },
});

export const approve = mutation({
  args: {
    id: v.id("vacationRequests"),
    reviewedById: v.id("teamMembers"),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request || request.status !== "pending") return null;

    // Mark as approved
    await ctx.db.patch(args.id, {
      status: "approved",
      reviewedById: args.reviewedById,
      reviewedAt: new Date().toISOString(),
      reviewNote: args.reviewNote,
    });

    // Create vacation entries for each day in the range
    const start = new Date(request.startDate);
    const end = new Date(request.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      const dateStr = d.toISOString().split("T")[0];
      await ctx.runMutation(api.timesheetEntries.markVacationDay, {
        teamMemberId: request.teamMemberId,
        date: dateStr,
      });
    }

    // Deduct from vacation balance
    const member = await ctx.db.get(request.teamMemberId);
    if (member) {
      const used = (member.vacationDaysUsed ?? 0) + request.totalDays;
      await ctx.db.patch(request.teamMemberId, { vacationDaysUsed: used });
    }

    return await ctx.db.get(args.id);
  },
});

export const deny = mutation({
  args: {
    id: v.id("vacationRequests"),
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
    return await ctx.db.get(args.id);
  },
});
