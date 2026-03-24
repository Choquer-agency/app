import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const lookupByDevice = query({
  args: { clientSlug: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const devices = await ctx.db
      .query("visitorDevices")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .take(1);
    if (devices.length === 0) return null;

    const visitor = await ctx.db.get(devices[0].visitorId);
    if (!visitor || visitor.clientSlug !== args.clientSlug) return null;

    return { id: visitor._id, visitorName: visitor.visitorName };
  },
});

export const register = mutation({
  args: {
    clientSlug: v.string(),
    visitorName: v.string(),
    deviceId: v.string(),
    deviceType: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmedName = args.visitorName.trim();

    // Find or create visitor
    const existing = await ctx.db
      .query("visitors")
      .withIndex("by_client_name", (q) =>
        q.eq("clientSlug", args.clientSlug).eq("visitorName", trimmedName)
      )
      .take(1);

    let visitorId;
    if (existing.length > 0) {
      visitorId = existing[0]._id;
    } else {
      visitorId = await ctx.db.insert("visitors", {
        clientSlug: args.clientSlug,
        visitorName: trimmedName,
      });
    }

    // Link device
    const existingDevice = await ctx.db
      .query("visitorDevices")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .take(1);

    if (existingDevice.length > 0) {
      await ctx.db.patch(existingDevice[0]._id, {
        visitorId,
        lastSeen: new Date().toISOString(),
      });
    } else {
      await ctx.db.insert("visitorDevices", {
        visitorId,
        deviceId: args.deviceId,
        deviceType: args.deviceType,
        userAgent: args.userAgent,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }

    return { id: visitorId, visitorName: trimmedName };
  },
});
