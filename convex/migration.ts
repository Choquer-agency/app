/**
 * Migration-only mutations for importing data from Neon.
 * These are public mutations that should be removed after migration is complete.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";

// Create team member with password hash (for migration only)
export const createTeamMemberWithAuth = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.optional(v.string()),
    calLink: v.optional(v.string()),
    profilePicUrl: v.optional(v.string()),
    color: v.optional(v.string()),
    startDate: v.optional(v.string()),
    birthday: v.optional(v.string()),
    active: v.optional(v.boolean()),
    roleLevel: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    lastLogin: v.optional(v.string()),
    slackUserId: v.optional(v.string()),
    availableHoursPerWeek: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    salary: v.optional(v.number()),
    payType: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("teamMembers", {
      name: args.name,
      email: args.email.toLowerCase(),
      role: args.role ?? "",
      calLink: args.calLink ?? "",
      profilePicUrl: args.profilePicUrl ?? "",
      color: args.color ?? "",
      startDate: args.startDate,
      birthday: args.birthday,
      active: args.active ?? true,
      roleLevel: args.roleLevel ?? "employee",
      passwordHash: args.passwordHash,
      lastLogin: args.lastLogin,
      slackUserId: args.slackUserId ?? "",
      availableHoursPerWeek: args.availableHoursPerWeek ?? 40,
      hourlyRate: args.hourlyRate,
      salary: args.salary,
      payType: args.payType ?? "hourly",
      tags: args.tags ?? [],
    });
    return await ctx.db.get(id);
  },
});

// Seed the counter for CHQ-XXX ticket numbering
export const seedCounter = mutation({
  args: { name: v.string(), value: v.number() },
  handler: async (ctx, args) => {
    // Check if counter already exists
    const existing = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .take(1);
    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, { value: args.value });
      return existing[0]._id;
    }
    return await ctx.db.insert("counters", {
      name: args.name,
      value: args.value,
    });
  },
});

// Bulk insert announcement (with author ID already mapped to Convex)
export const createAnnouncement = mutation({
  args: {
    authorId: v.id("teamMembers"),
    title: v.string(),
    content: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    source: v.optional(v.string()),
    announcementType: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("announcements", {
      authorId: args.authorId,
      title: args.title,
      content: args.content ?? "",
      pinned: args.pinned ?? false,
      source: args.source ?? "manual",
      announcementType: args.announcementType ?? "general",
      expiresAt: args.expiresAt,
      imageUrl: args.imageUrl ?? "",
    });
    return await ctx.db.get(id);
  },
});

export const createAnnouncementReaction = mutation({
  args: {
    announcementId: v.id("announcements"),
    teamMemberId: v.id("teamMembers"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("announcementReactions", {
      announcementId: args.announcementId,
      teamMemberId: args.teamMemberId,
      emoji: args.emoji,
    });
  },
});

export const createCalendarEvent = mutation({
  args: {
    title: v.string(),
    eventDate: v.string(),
    eventType: v.optional(v.string()),
    recurrence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("calendarEvents", {
      title: args.title,
      eventDate: args.eventDate,
      eventType: args.eventType ?? "custom",
      recurrence: args.recurrence ?? "none",
    });
  },
});

export const createWeeklyQuote = mutation({
  args: {
    quote: v.string(),
    author: v.optional(v.string()),
    weekStart: v.string(),
    selected: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("weeklyQuotes", {
      quote: args.quote,
      author: args.author ?? "",
      weekStart: args.weekStart,
      selected: args.selected ?? false,
    });
  },
});
