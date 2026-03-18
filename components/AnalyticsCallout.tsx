import { AnalyticsEnrichment } from "@/types/enrichment";

interface AnalyticsCalloutProps {
  enrichment: AnalyticsEnrichment;
}

export default function AnalyticsCallout({ enrichment }: AnalyticsCalloutProps) {
  const { entityType, entity, data } = enrichment;

  return (
    <div className="bg-[#FAFCFF] border border-[#E5E5E5] rounded-lg px-3 py-2 mt-2 inline-flex items-center gap-4 text-xs">
      {entityType === "page" && (
        <>
          <span className="text-muted font-medium">{entity}</span>
          {data.clicks !== undefined && (
            <span>
              <span className="text-muted">Clicks:</span>{" "}
              <span className="font-semibold text-[#1A1A1A]">{data.clicks.toLocaleString()}</span>
            </span>
          )}
          {data.impressions !== undefined && (
            <span>
              <span className="text-muted">Impressions:</span>{" "}
              <span className="font-semibold text-[#1A1A1A]">{data.impressions.toLocaleString()}</span>
            </span>
          )}
        </>
      )}

      {entityType === "keyword" && (
        <>
          <span className="text-muted font-medium">&ldquo;{entity}&rdquo;</span>
          {data.position !== undefined && (
            <span>
              <span className="text-muted">Position:</span>{" "}
              <span className="font-semibold text-[#1A1A1A]">#{data.position}</span>
            </span>
          )}
          {data.change !== undefined && data.change !== 0 && (
            <span className={data.change > 0 ? "text-[#0d7a55]" : "text-[#b91c1c]"}>
              {data.change > 0 ? "+" : ""}{data.change}
            </span>
          )}
        </>
      )}

      {entityType === "metric" && (
        <>
          <span className="text-muted">{entity}</span>
          {data.sessions !== undefined && (
            <span>
              <span className="text-muted">Actual:</span>{" "}
              <span className="font-semibold text-[#1A1A1A]">{data.sessions.toLocaleString()} sessions</span>
            </span>
          )}
        </>
      )}

      <span className="text-[10px] bg-[#B1D0FF] text-[#1a4a7a] px-1.5 py-0.5 rounded font-medium">
        Live data
      </span>
    </div>
  );
}
