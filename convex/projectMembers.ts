import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Enrich with team member details
    const enriched = await Promise.all(
      members.map(async (m) => {
        const teamMember = await ctx.db.get(m.teamMemberId);
        return {
          ...m,
          memberName: teamMember?.name ?? "",
          memberEmail: teamMember?.email ?? "",
          memberColor: teamMember?.color,
          memberProfilePicUrl: teamMember?.profilePicUrl,
        };
      })
    );

    return enriched;
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    teamMemberId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    // Check if already a member to avoid duplicates
    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const alreadyMember = existing.find(
      (m) => m.teamMemberId === args.teamMemberId
    );
    if (alreadyMember) {
      return alreadyMember;
    }

    const id = await ctx.db.insert("projectMembers", {
      projectId: args.projectId,
      teamMemberId: args.teamMemberId,
    });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: {
    projectId: v.id("projects"),
    teamMemberId: v.id("teamMembers"),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const member = members.find(
      (m) => m.teamMemberId === args.teamMemberId
    );
    if (member) {
      await ctx.db.delete(member._id);
    }
  },
});
