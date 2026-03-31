import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.activeOnly !== false) {
      return await ctx.db
        .query("teamMembers")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect();
    }
    return await ctx.db.query("teamMembers").collect();
  },
});

export const getById = query({
  args: { id: v.id("teamMembers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .take(1);
    return members[0] ?? null;
  },
});

// Internal: used by auth system, returns password hash
export const getByEmailForAuth = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .take(1);
    return members[0] ?? null;
  },
});

export const create = mutation({
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
    employeeStatus: v.optional(v.string()),
    roleLevel: v.optional(v.string()),
    slackUserId: v.optional(v.string()),
    availableHoursPerWeek: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    salary: v.optional(v.number()),
    payType: v.optional(v.string()),
    vacationDaysTotal: v.optional(v.number()),
    vacationDaysUsed: v.optional(v.number()),
    sickDaysTotal: v.optional(v.number()),
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
      slackUserId: args.slackUserId ?? "",
      availableHoursPerWeek: args.availableHoursPerWeek ?? 40,
      hourlyRate: args.hourlyRate,
      salary: args.salary,
      payType: args.payType ?? "hourly",
      vacationDaysTotal: args.vacationDaysTotal,
      vacationDaysUsed: args.vacationDaysUsed,
      tags: args.tags ?? [],
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("teamMembers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
    calLink: v.optional(v.string()),
    profilePicUrl: v.optional(v.string()),
    color: v.optional(v.string()),
    startDate: v.optional(v.string()),
    birthday: v.optional(v.string()),
    active: v.optional(v.boolean()),
    employeeStatus: v.optional(v.string()),
    roleLevel: v.optional(v.string()),
    slackUserId: v.optional(v.string()),
    availableHoursPerWeek: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    salary: v.optional(v.number()),
    payType: v.optional(v.string()),
    vacationDaysTotal: v.optional(v.number()),
    vacationDaysUsed: v.optional(v.number()),
    sickDaysTotal: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    bypassClockIn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    // Remove undefined fields so patch only updates what's provided
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = key === "email" && typeof value === "string" ? value.toLowerCase() : value;
      }
    }
    await ctx.db.patch(id, updates);
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("teamMembers") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const updateLastLogin = internalMutation({
  args: { id: v.id("teamMembers") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastLogin: new Date().toISOString() });
  },
});

export const setPasswordHash = internalMutation({
  args: { id: v.id("teamMembers"), hash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { passwordHash: args.hash });
  },
});

export const setPasswordAndRole = internalMutation({
  args: { id: v.id("teamMembers"), hash: v.string(), roleLevel: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      passwordHash: args.hash,
      roleLevel: args.roleLevel,
    });
  },
});

export const hasAdminWithPassword = internalQuery({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("teamMembers").collect();
    return members.some(
      (m) =>
        (m.roleLevel === "admin" || m.roleLevel === "owner") &&
        m.passwordHash != null
    );
  },
});
