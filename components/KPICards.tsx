import { KPIData } from "@/types";

interface KPICardsProps {
  kpis: KPIData[];
}

function fmt(value: number, format: KPIData["format"]): string {
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "decimal") return value.toFixed(1);
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

export default function KPICards({ kpis }: KPICardsProps) {
  return (
    <section id="kpi-section" className="mb-6" data-track="kpi">
      <div className="flex gap-0 border border-[#E5E5E5] rounded-xl overflow-hidden bg-white">
        {kpis.map((kpi, i) => {
          const unavailable = kpi.value === -1;
          const isUp = kpi.changePercent >= 0;
          const isLeads = kpi.label === "Leads";
          return (
            <div
              key={kpi.label}
              className={`flex-1 px-3 py-3 text-center ${
                i < kpis.length - 1 ? "border-r border-[#E5E5E5]" : ""
              } ${isLeads ? "bg-[#FFF8EE]" : ""}`}
            >
              <p className="text-[10px] text-muted font-medium uppercase tracking-wide">
                {kpi.label}
              </p>
              {unavailable ? (
                <>
                  <p className="text-lg font-bold mt-0.5 text-[#D1D5DB]">--</p>
                  <p className="text-[10px] text-muted">Not connected</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold mt-0.5">{fmt(kpi.value, kpi.format)}</p>
                  <p
                    className={`text-xs font-medium ${
                      isUp ? "text-[#0d7a55]" : "text-[#b91c1c]"
                    }`}
                  >
                    {isUp ? "+" : ""}
                    {kpi.changePercent.toFixed(1)}%
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
