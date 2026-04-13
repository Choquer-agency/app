import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { decryptCredentials } from "@/lib/credentials-crypto";
import { getConnector } from "@/lib/marketing/registry";
import { resolveDateRange } from "@/lib/marketing/date-ranges";
import { getDestination } from "@/lib/destinations/registry";
import { toTabular } from "@/lib/destinations/transform";
import { googleAccessTokenAccessor, notionTokenAccessor } from "@/lib/destinations/connection";
import type { Id } from "@/convex/_generated/dataModel";
import type { DateRangePreset } from "@/lib/marketing/types";

export interface SyncRunResult {
  runId: Id<"syncRuns">;
  rowsRead: number;
  rowsWritten: number;
  destinationRef: string;
}

/**
 * Executes a single sync job end-to-end:
 *   1) fetch from source connector
 *   2) transform to tabular payload
 *   3) push to destination
 *   4) record run + advance schedule
 *
 * Used by BOTH the dispatcher cron and the manual "Run now" button.
 * Caller is responsible for catching thrown errors (this function still
 * writes a failed syncRuns row + advances the schedule before throwing).
 */
export async function executeSyncJob(
  jobId: Id<"syncJobs">,
  triggeredBy: "schedule" | "manual" | "mcp",
  triggeredById?: Id<"teamMembers">
): Promise<SyncRunResult> {
  const convex = getConvexClient();
  const job = await convex.query(api.syncJobs.getById, { id: jobId });
  if (!job) throw new Error(`Sync job ${jobId} not found`);

  const runId = await convex.mutation(api.syncRuns.start, {
    syncJobId: job._id,
    triggeredBy,
    triggeredById,
  });

  try {
    const client = await convex.query(api.clients.getById, { id: job.clientId });
    if (!client) throw new Error(`Client ${job.clientId} not found`);

    const dateRange = resolveDateRange({ preset: job.dateRangePreset as DateRangePreset });

    const connector = getConnector(job.sourcePlatform as any);
    const result = await connector.fetch(
      { client: client as any },
      {
        metrics: job.metrics,
        dimensions: job.dimensions,
        dateRange,
        filters: job.filters as any,
        limit: job.rowLimit ?? 10000,
      }
    );

    const payload = toTabular(result, client.name, client.slug);

    const dest = await convex.query(api.destinations.getById, { id: job.destinationId });
    if (!dest) throw new Error(`Destination ${job.destinationId} not found`);

    const driver = getDestination(dest.type);
    const config = JSON.parse(decryptCredentials(dest.encryptedConfig, dest.configIv));

    const pushResult = await driver.push(
      {
        workspace: { id: "choquer" },
        config,
        getGoogleAccessToken: googleAccessTokenAccessor(dest.connectionId),
        getNotionToken: notionTokenAccessor(dest.connectionId),
      },
      payload
    );

    await convex.mutation(api.syncRuns.complete, {
      id: runId,
      status: "success",
      rowsRead: payload.rows.length,
      rowsWritten: pushResult.rowsWritten,
    });
    await convex.mutation(api.syncJobs.advanceSchedule, { id: job._id, now: Date.now() });

    return {
      runId,
      rowsRead: payload.rows.length,
      rowsWritten: pushResult.rowsWritten,
      destinationRef: pushResult.destinationRef,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await convex.mutation(api.syncRuns.complete, {
      id: runId,
      status: "error",
      error: message,
    });
    await convex.mutation(api.syncJobs.advanceSchedule, { id: job._id, now: Date.now() });
    throw err;
  }
}
