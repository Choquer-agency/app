import { BigQuery } from "@google-cloud/bigquery";
import type {
  Destination,
  DestinationContext,
  PushResult,
  TabularPayload,
  ColumnType,
} from "./types";
import { DestinationError } from "./types";

interface BigQueryConfig {
  projectId: string;
  datasetId: string;
  tableId: string;
  writeMode: "replace" | "append";
}

function bqClient(accessToken: string, projectId: string) {
  // Pass an access token directly; BigQuery lib supports this via authClient.
  return new BigQuery({
    projectId,
    authClient: {
      getRequestHeaders: async () => ({ Authorization: `Bearer ${accessToken}` }),
      getProjectId: async () => projectId,
      // Minimal shape the GaxiosAuthClient interface expects
    } as any,
  });
}

const TYPE_MAP: Record<ColumnType, string> = {
  string: "STRING",
  number: "FLOAT64",
  date: "DATE",
  boolean: "BOOL",
};

function payloadToSchemaFields(payload: TabularPayload) {
  return payload.schema.map((c) => ({
    name: sanitizeColumnName(c.name),
    type: TYPE_MAP[c.type] ?? "STRING",
    mode: "NULLABLE" as const,
  }));
}

/** BigQuery column names must match [A-Za-z_][A-Za-z0-9_]* */
function sanitizeColumnName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}

function rowsForBq(payload: TabularPayload): Record<string, unknown>[] {
  return payload.rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const col of payload.schema) {
      const safeKey = sanitizeColumnName(col.name);
      const v = r[col.name];
      out[safeKey] = v == null || v === "" ? null : v;
    }
    return out;
  });
}

export const bigqueryDestination: Destination<BigQueryConfig> = {
  type: "bigquery",

  validate(raw) {
    const r = raw as Partial<BigQueryConfig> | undefined;
    if (!r || typeof r !== "object") return { ok: false, error: "config must be an object" };
    if (!r.projectId) return { ok: false, error: "projectId required" };
    if (!r.datasetId) return { ok: false, error: "datasetId required" };
    if (!r.tableId) return { ok: false, error: "tableId required" };
    const mode = r.writeMode ?? "append";
    if (mode !== "replace" && mode !== "append") {
      return { ok: false, error: "writeMode must be 'replace' or 'append'" };
    }
    return {
      ok: true,
      config: {
        projectId: r.projectId,
        datasetId: r.datasetId,
        tableId: r.tableId,
        writeMode: mode,
      },
    };
  },

  async test(ctx: DestinationContext) {
    const cfg = ctx.config as BigQueryConfig;
    if (!ctx.getGoogleAccessToken) {
      return { ok: false, error: "Google access token not available" };
    }
    try {
      const token = await ctx.getGoogleAccessToken();
      const bq = bqClient(token, cfg.projectId);
      const dataset = bq.dataset(cfg.datasetId);
      const [datasetExists] = await dataset.exists();
      if (!datasetExists) {
        return { ok: false, error: `Dataset ${cfg.projectId}:${cfg.datasetId} not found` };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("insufficient") || msg.includes("403")) {
        return {
          ok: false,
          error: "Insufficient BigQuery access — check project permissions and OAuth scopes.",
        };
      }
      return { ok: false, error: msg };
    }
  },

  async push(ctx: DestinationContext, payload: TabularPayload): Promise<PushResult> {
    const cfg = ctx.config as BigQueryConfig;
    if (!ctx.getGoogleAccessToken) {
      throw new DestinationError("Google access token not available", "auth_failed");
    }
    const token = await ctx.getGoogleAccessToken();
    const bq = bqClient(token, cfg.projectId);
    const dataset = bq.dataset(cfg.datasetId);
    const table = dataset.table(cfg.tableId);
    const tableFqn = `${cfg.projectId}.${cfg.datasetId}.${cfg.tableId}`;

    const [tableExists] = await table.exists();
    const schemaFields = payloadToSchemaFields(payload);

    if (!tableExists) {
      await dataset.createTable(cfg.tableId, { schema: { fields: schemaFields } });
    }

    if (payload.rows.length === 0) {
      return { rowsWritten: 0, destinationRef: tableFqn };
    }

    const rows = rowsForBq(payload);

    if (cfg.writeMode === "replace") {
      // Truncate by deleting + recreating the table (simpler than a DML DELETE which
      // hits BigQuery's streaming-buffer restrictions on freshly-written rows).
      if (tableExists) {
        await table.delete({ ignoreNotFound: true });
      }
      await dataset.createTable(cfg.tableId, { schema: { fields: schemaFields } });
      // Fresh tables sometimes take a beat to propagate — retry once
      const freshTable = dataset.table(cfg.tableId);
      await insertWithRetry(freshTable, rows);
    } else {
      await insertWithRetry(table, rows);
    }

    return { rowsWritten: rows.length, destinationRef: tableFqn };
  },
};

async function insertWithRetry(
  table: ReturnType<ReturnType<BigQuery["dataset"]>["table"]>,
  rows: Record<string, unknown>[],
  attempts = 3
): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await table.insert(rows, { ignoreUnknownValues: true, raw: false });
      return;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Not found") || msg.includes("404")) {
        // Table propagation delay — wait then retry
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw toDestinationError(e);
    }
  }
  throw toDestinationError(lastError);
}

function toDestinationError(e: unknown): DestinationError {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("quota")) return new DestinationError(msg, "quota_exceeded");
  if (msg.includes("403") || msg.includes("insufficient")) {
    return new DestinationError(msg, "auth_failed");
  }
  if (msg.includes("404") || msg.includes("Not found")) {
    return new DestinationError(msg, "not_found");
  }
  return new DestinationError(msg, "upstream_error");
}
