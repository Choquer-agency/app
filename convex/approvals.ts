import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByClient = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("approvals")
      .withIndex("by_client", (q) => q.eq("clientSlug", args.clientSlug))
      .collect();
    // Filter out dismissed, sort pending first
    return docs
      .filter((d) => d.status !== "dismissed")
      .sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return b._creationTime - a._creationTime;
      });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("approvals"),
    status: v.string(),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      feedback: args.feedback,
    });
  },
});

export const dismiss = mutation({
  args: { id: v.id("approvals") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "dismissed" });
  },
});

export const upsert = mutation({
  args: {
    clientSlug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    links: v.optional(v.any()),
    contentHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for existing by content hash
    if (args.contentHash) {
      const existing = await ctx.db
        .query("approvals")
        .withIndex("by_client_hash", (q) =>
          q.eq("clientSlug", args.clientSlug).eq("contentHash", args.contentHash)
        )
        .take(1);
      if (existing.length > 0 && existing[0].status !== "pending") return;
    }

    // Check for existing by title
    const byTitle = await ctx.db
      .query("approvals")
      .withIndex("by_client", (q) => q.eq("clientSlug", args.clientSlug))
      .collect();
    const match = byTitle.find((a) => a.title === args.title);

    if (match) {
      if (match.status === "pending") {
        await ctx.db.patch(match._id, {
          description: args.description,
          links: args.links,
          contentHash: args.contentHash,
        });
      }
      return;
    }

    await ctx.db.insert("approvals", {
      clientSlug: args.clientSlug,
      title: args.title,
      description: args.description,
      links: args.links,
      status: "pending",
      contentHash: args.contentHash,
    });
  },
});
