import type { ResolvedDateRange } from "@/lib/marketing/types";

export type DestinationType = "sheets" | "bigquery" | "notion";

export type ColumnType = "string" | "number" | "date" | "boolean";

export interface Column {
  name: string;
  type: ColumnType;
}

export interface TabularPayload {
  schema: Column[];
  rows: Record<string, string | number | boolean | null>[];
  meta: {
    source: string;
    dateRange: ResolvedDateRange;
    clientName: string;
    clientSlug: string;
  };
}

export interface PushResult {
  rowsWritten: number;
  destinationRef: string; // URL / FQN / Notion page URL
}

export interface DestinationContext {
  /** Future multi-tenant hook. Hard-coded to "choquer" for now. */
  workspace: { id: string };
  /** Decrypted, validated config as returned by `validate()`. */
  config: unknown;
  /** Lazy Google OAuth access token accessor (refreshes on demand). */
  getGoogleAccessToken?: () => Promise<string>;
  /** Notion integration token (raw API key). */
  getNotionToken?: () => Promise<string>;
}

export interface Destination<TConfig = unknown> {
  type: DestinationType;
  validate(
    raw: unknown
  ): { ok: true; config: TConfig } | { ok: false; error: string };
  test(ctx: DestinationContext): Promise<{ ok: boolean; error?: string }>;
  push(ctx: DestinationContext, payload: TabularPayload): Promise<PushResult>;
}

export class DestinationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_config"
      | "auth_failed"
      | "not_found"
      | "quota_exceeded"
      | "upstream_error"
  ) {
    super(message);
  }
}
