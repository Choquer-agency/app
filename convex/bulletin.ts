import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// === Personal Notes ===

export const getPersonalNote = query({
  args: { teamMemberId: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("personalNotes")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .take(1);
    return docs[0] ?? null;
  },
});

export const upsertPersonalNote = mutation({
  args: { teamMemberId: v.id("teamMembers"), content: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("personalNotes")
      .withIndex("by_member", (q) => q.eq("teamMemberId", args.teamMemberId))
      .take(1);
    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, { content: args.content });
      return existing[0]._id;
    }
    return await ctx.db.insert("personalNotes", {
      teamMemberId: args.teamMemberId,
      content: args.content,
    });
  },
});

// === Announcements ===

export const listAnnouncements = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("announcements")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

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
    return await ctx.db.insert("announcements", {
      authorId: args.authorId,
      title: args.title,
      content: args.content ?? "",
      pinned: args.pinned ?? false,
      source: args.source ?? "manual",
      announcementType: args.announcementType ?? "general",
      expiresAt: args.expiresAt,
      imageUrl: args.imageUrl ?? "",
    });
  },
});

export const deleteAnnouncement = mutation({
  args: { id: v.id("announcements") },
  handler: async (ctx, args) => {
    // Delete reactions first
    const reactions = await ctx.db
      .query("announcementReactions")
      .withIndex("by_announcement", (q) => q.eq("announcementId", args.id))
      .collect();
    for (const r of reactions) {
      await ctx.db.delete(r._id);
    }
    await ctx.db.delete(args.id);
  },
});

// === Reactions ===

export const listReactions = query({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("announcementReactions")
      .withIndex("by_announcement", (q) => q.eq("announcementId", args.announcementId))
      .collect();
  },
});

export const toggleReaction = mutation({
  args: {
    announcementId: v.id("announcements"),
    teamMemberId: v.id("teamMembers"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("announcementReactions")
      .withIndex("by_announcement", (q) => q.eq("announcementId", args.announcementId))
      .collect();
    const match = existing.find(
      (r) => r.teamMemberId === args.teamMemberId && r.emoji === args.emoji
    );
    if (match) {
      await ctx.db.delete(match._id);
      return "removed";
    }
    await ctx.db.insert("announcementReactions", {
      announcementId: args.announcementId,
      teamMemberId: args.teamMemberId,
      emoji: args.emoji,
    });
    return "added";
  },
});

// === Weekly Quotes ===

export const getQuoteForWeek = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("weeklyQuotes")
      .withIndex("by_week", (q) => q.eq("weekStart", args.weekStart))
      .collect();
    return docs.find((d) => d.selected) ?? docs[0] ?? null;
  },
});

export const createQuote = mutation({
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

export const selectQuote = mutation({
  args: { id: v.id("weeklyQuotes") },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.id);
    if (!quote) return;
    // Deselect all for this week
    const sameWeek = await ctx.db
      .query("weeklyQuotes")
      .withIndex("by_week", (q) => q.eq("weekStart", quote.weekStart))
      .collect();
    for (const q of sameWeek) {
      if (q.selected) await ctx.db.patch(q._id, { selected: false });
    }
    await ctx.db.patch(args.id, { selected: true });
  },
});

// === Calendar Events ===

export const listCalendarEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("calendarEvents").collect();
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

export const deleteCalendarEvent = mutation({
  args: { id: v.id("calendarEvents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
