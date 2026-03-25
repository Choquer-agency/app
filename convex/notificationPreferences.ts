import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByMember = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notificationPreferences")
      .withIndex("by_teamMemberId", (q) => q.eq("teamMemberId", args.teamMemberId))
      .unique();
  },
});

const prefsValidator = {
  ticket_assigned: v.optional(v.boolean()),
  ticket_status_stuck: v.optional(v.boolean()),
  ticket_status_qa_ready: v.optional(v.boolean()),
  ticket_status_needs_attention: v.optional(v.boolean()),
  ticket_status_change: v.optional(v.boolean()),
  ticket_created: v.optional(v.boolean()),
  ticket_comment: v.optional(v.boolean()),
  ticket_mention: v.optional(v.boolean()),
  ticket_due_soon: v.optional(v.boolean()),
  ticket_overdue: v.optional(v.boolean()),
  ticket_due_date_changed: v.optional(v.boolean()),
  ticket_closed: v.optional(v.boolean()),
  vacation_requested: v.optional(v.boolean()),
  vacation_resolved: v.optional(v.boolean()),
  time_adjustment_requested: v.optional(v.boolean()),
  time_adjustment_resolved: v.optional(v.boolean()),
  team_announcement: v.optional(v.boolean()),
  hour_cap_warning: v.optional(v.boolean()),
  hour_cap_exceeded: v.optional(v.boolean()),
  runaway_timer: v.optional(v.boolean()),
};

export const upsert = mutation({
  args: {
    teamMemberId: v.id("teamMembers"),
    prefs: v.object(prefsValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_teamMemberId", (q) => q.eq("teamMemberId", args.teamMemberId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args.prefs);
      return existing._id;
    } else {
      return await ctx.db.insert("notificationPreferences", {
        teamMemberId: args.teamMemberId,
        ...args.prefs,
      });
    }
  },
});
