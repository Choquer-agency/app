import type { MetricResult } from "@/lib/marketing/types";
import type { Column, TabularPayload } from "./types";

/**
 * Flatten a MetricResult's breakdown rows into a tabular payload.
 * - One row per breakdown entry.
 * - Columns: all dimensions first, then all metrics.
 * - Empty breakdown (only totals) → single-row payload with the totals.
 */
export function toTabular(result: MetricResult, clientName: string, clientSlug: string): TabularPayload {
  const dimensionKeys = collectDimensionKeys(result);
  const metricKeys = collectMetricKeys(result);

  const schema: Column[] = [
    ...dimensionKeys.map((name) => ({ name, type: "string" as const })),
    ...metricKeys.map((name) => ({ name, type: "number" as const })),
  ];

  const rows: TabularPayload["rows"] = [];

  if (result.breakdown.length > 0) {
    for (const r of result.breakdown) {
      const row: Record<string, string | number> = {};
      for (const d of dimensionKeys) row[d] = r.dimensions?.[d] ?? "";
      for (const m of metricKeys) row[m] = r.metrics[m] ?? 0;
      rows.push(row);
    }
  } else {
    const row: Record<string, string | number> = {};
    for (const d of dimensionKeys) row[d] = "";
    for (const m of metricKeys) row[m] = result.totals[m] ?? 0;
    rows.push(row);
  }

  return {
    schema,
    rows,
    meta: {
      source: result.platform,
      dateRange: result.dateRange,
      clientName,
      clientSlug,
    },
  };
}

function collectDimensionKeys(result: MetricResult): string[] {
  const set = new Set<string>();
  for (const r of result.breakdown) {
    if (r.dimensions) Object.keys(r.dimensions).forEach((k) => set.add(k));
  }
  return [...set];
}

function collectMetricKeys(result: MetricResult): string[] {
  const set = new Set<string>(Object.keys(result.totals));
  for (const r of result.breakdown) {
    Object.keys(r.metrics).forEach((k) => set.add(k));
  }
  return [...set];
}
