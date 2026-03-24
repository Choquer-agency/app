import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ticketAttachments")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    ticketId: v.id("tickets"),
    uploadedById: v.optional(v.id("teamMembers")),
    uploadedByName: v.optional(v.string()),
    fileName: v.string(),
    fileUrl: v.string(),
    fileSize: v.optional(v.number()),
    fileType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("ticketAttachments", {
      ticketId: args.ticketId,
      uploadedById: args.uploadedById,
      uploadedByName: args.uploadedByName ?? "",
      fileName: args.fileName,
      fileUrl: args.fileUrl,
      fileSize: args.fileSize ?? 0,
      fileType: args.fileType ?? "",
    });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { id: v.id("ticketAttachments") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
