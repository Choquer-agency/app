import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByDateRange = query({
  args: {
    startDate: v.string(), // ISO date "YYYY-MM-DD"
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch all transactions and filter by date range in JS
    // txnTime is stored as "MM/DD/YYYY HH:MM:SS AM/PM" from Converge
    const all = await ctx.db
      .query("convergeTransactions")
      .withIndex("by_txnTime")
      .collect();

    return all.filter((t) => {
      if (!t.txnTime) return false;
      // Parse Converge date format "MM/DD/YYYY HH:MM:SS AM/PM"
      const d = new Date(t.txnTime);
      if (isNaN(d.getTime())) return false;
      const tDate = d.toISOString().split("T")[0];
      return tDate >= args.startDate && tDate <= args.endDate;
    });
  },
});

export const upsertBatch = mutation({
  args: {
    transactions: v.array(
      v.object({
        txnId: v.string(),
        terminal: v.string(),
        status: v.string(),
        resultMessage: v.string(),
        transStatus: v.string(),
        amount: v.number(),
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        company: v.optional(v.string()),
        description: v.optional(v.string()),
        txnType: v.optional(v.string()),
        refundedAmount: v.optional(v.number()),
        cardType: v.optional(v.string()),
        cardLastFour: v.optional(v.string()),
        cardExpiryMonth: v.optional(v.number()),
        cardExpiryYear: v.optional(v.number()),
        recurringId: v.optional(v.string()),
        txnTime: v.optional(v.string()),
        settleTime: v.optional(v.string()),
        approvalCode: v.optional(v.string()),
        clientName: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let skipped = 0;

    for (const txn of args.transactions) {
      // Check if already exists by txnId
      const existing = await ctx.db
        .query("convergeTransactions")
        .withIndex("by_txnId", (q) => q.eq("txnId", txn.txnId))
        .first();

      if (existing) {
        // Update fields that may have been enriched or added later
        const patch: Record<string, unknown> = {};
        if (txn.clientName && txn.clientName !== existing.clientName) patch.clientName = txn.clientName;
        if (txn.txnType && txn.txnType !== existing.txnType) patch.txnType = txn.txnType;
        if (txn.status && txn.status !== existing.status) patch.status = txn.status;
        if (txn.refundedAmount !== undefined && txn.refundedAmount !== existing.refundedAmount) patch.refundedAmount = txn.refundedAmount;
        if (Object.keys(patch).length > 0) await ctx.db.patch(existing._id, patch);
        skipped++;
      } else {
        await ctx.db.insert("convergeTransactions", txn);
        inserted++;
      }
    }

    return { inserted, skipped };
  },
});

export const listByClientName = query({
  args: { clientName: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("convergeTransactions").collect();
    return all
      .filter((t) => t.clientName === args.clientName)
      .sort((a, b) => {
        const ta = a.txnTime ? new Date(a.txnTime).getTime() : 0;
        const tb = b.txnTime ? new Date(b.txnTime).getTime() : 0;
        return tb - ta;
      });
  },
});

export const updateClientNames = mutation({
  args: {
    updates: v.array(
      v.object({
        recurringId: v.string(),
        clientName: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const update of args.updates) {
      const txns = await ctx.db
        .query("convergeTransactions")
        .withIndex("by_recurringId", (q) => q.eq("recurringId", update.recurringId))
        .collect();
      for (const txn of txns) {
        if (txn.clientName !== update.clientName) {
          await ctx.db.patch(txn._id, { clientName: update.clientName });
        }
      }
    }
  },
});
