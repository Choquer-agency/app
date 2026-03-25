import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const DEFAULTS = {
  halfDaySickCutoffTime: "12:00",
  overtimeThresholdMinutes: 480,
  longShiftBreakThresholdMinutes: 300,
  defaultVacationDaysPerYear: 10,
  bookkeeperEmail: "",
  companyLogoUrl: "",
  standardWorkDayHours: 8,
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("timesheetSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .take(1);

    if (settings.length === 0) {
      return { key: "global", ...DEFAULTS };
    }

    return {
      key: "global",
      halfDaySickCutoffTime:
        settings[0].halfDaySickCutoffTime ?? DEFAULTS.halfDaySickCutoffTime,
      overtimeThresholdMinutes:
        settings[0].overtimeThresholdMinutes ??
        DEFAULTS.overtimeThresholdMinutes,
      longShiftBreakThresholdMinutes:
        settings[0].longShiftBreakThresholdMinutes ??
        DEFAULTS.longShiftBreakThresholdMinutes,
      defaultVacationDaysPerYear:
        settings[0].defaultVacationDaysPerYear ??
        DEFAULTS.defaultVacationDaysPerYear,
      bookkeeperEmail:
        settings[0].bookkeeperEmail ?? DEFAULTS.bookkeeperEmail,
      companyLogoUrl:
        settings[0].companyLogoUrl ?? DEFAULTS.companyLogoUrl,
      standardWorkDayHours:
        settings[0].standardWorkDayHours ?? DEFAULTS.standardWorkDayHours,
      sickHoursTotal: settings[0].sickHoursTotal ?? undefined,
    };
  },
});

export const update = mutation({
  args: {
    halfDaySickCutoffTime: v.optional(v.string()),
    overtimeThresholdMinutes: v.optional(v.number()),
    longShiftBreakThresholdMinutes: v.optional(v.number()),
    defaultVacationDaysPerYear: v.optional(v.number()),
    bookkeeperEmail: v.optional(v.string()),
    companyLogoUrl: v.optional(v.string()),
    standardWorkDayHours: v.optional(v.number()),
    sickHoursTotal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("timesheetSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .take(1);

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, updates);
      return await ctx.db.get(existing[0]._id);
    }

    const id = await ctx.db.insert("timesheetSettings", {
      key: "global",
      ...updates,
    });
    return await ctx.db.get(id);
  },
});
