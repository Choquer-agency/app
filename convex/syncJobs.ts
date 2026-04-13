import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    clientId: v.optional(v.id("clients")),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { clientId, activeOnly }) => {
    let rows;
    if (clientId) {
      rows = await ctx.db
        .query("syncJobs")
        .withIndex("by_client", (q) => q.eq("clientId", clientId))
        .collect();
    } else {
      rows = await ctx.db.query("syncJobs").order("desc").collect();
    }
    if (activeOnly) rows = rows.filter((r) => r.active);
    return rows;
  },
});

export const getById = query({
  args: { id: v.id("syncJobs") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const listDue = query({
  args: { before: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { before, limit }) => {
    const rows = await ctx.db
      .query("syncJobs")
      .withIndex("by_nextRun", (q) =>
        q.eq("active", true).lte("nextRunAt", before)
      )
      .take(limit ?? 25);
    return rows;
  },
});

const filterSchema = v.object({
  dimension: v.string(),
  op: v.string(),
  value: v.string(),
});

export const create = mutation({
  args: {
    name: v.string(),
    clientId: v.id("clients"),
    sourcePlatform: v.string(),
    destinationId: v.id("destinations"),
    metrics: v.array(v.string()),
    dimensions: v.array(v.string()),
    dateRangePreset: v.string(),
    filters: v.optional(v.array(filterSchema)),
    rowLimit: v.optional(v.number()),
    frequency: v.string(),
    dayOfWeek: v.optional(v.number()),
    hourOfDay: v.optional(v.number()),
    nextRunAt: v.number(),
    createdById: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("syncJobs", {
      ...args,
      active: true,
      createdAt: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("syncJobs"),
    name: v.optional(v.string()),
    metrics: v.optional(v.array(v.string())),
    dimensions: v.optional(v.array(v.string())),
    dateRangePreset: v.optional(v.string()),
    filters: v.optional(v.array(filterSchema)),
    rowLimit: v.optional(v.number()),
    frequency: v.optional(v.string()),
    dayOfWeek: v.optional(v.number()),
    hourOfDay: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) updates[k] = v;
    }
    await ctx.db.patch(id, updates);
  },
});

export const advanceSchedule = mutation({
  args: { id: v.id("syncJobs"), now: v.number() },
  handler: async (ctx, { id, now }) => {
    const job = await ctx.db.get(id);
    if (!job) return;
    const next = computeNextRun(job.frequency, job.hourOfDay, job.dayOfWeek, now);
    await ctx.db.patch(id, { lastRunAt: now, nextRunAt: next });
  },
});

export const remove = mutation({
  args: { id: v.id("syncJobs") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

function computeNextRun(
  frequency: string,
  hourOfDay: number | undefined,
  dayOfWeek: number | undefined,
  nowMs: number
): number {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;

  if (frequency === "hourly") return nowMs + HOUR;

  if (frequency === "daily") {
    const d = new Date(nowMs);
    const target = new Date(Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      hourOfDay ?? d.getUTCHours(),
      0,
      0,
      0
    ));
    if (target.getTime() <= nowMs) target.setTime(target.getTime() + DAY);
    return target.getTime();
  }

  if (frequency === "weekly") {
    const d = new Date(nowMs);
    const target = new Date(Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      hourOfDay ?? d.getUTCHours(),
      0,
      0,
      0
    ));
    const targetDow = dayOfWeek ?? d.getUTCDay();
    const diff = (targetDow - target.getUTCDay() + 7) % 7;
    target.setTime(target.getTime() + diff * DAY);
    if (target.getTime() <= nowMs) target.setTime(target.getTime() + WEEK);
    return target.getTime();
  }

  // Fallback: one day later
  return nowMs + DAY;
}
