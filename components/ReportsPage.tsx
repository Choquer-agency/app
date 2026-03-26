"use client";

import { useState } from "react";
import ReportPeriodSelector, { getDateRange, type PeriodPreset } from "./reports/ReportPeriodSelector";
import UtilizationTab from "./reports/UtilizationTab";
import ProfitabilityTab from "./reports/ProfitabilityTab";
import VelocityTab from "./reports/VelocityTab";
import PerformanceTab from "./reports/PerformanceTab";
import RevenueTab from "./reports/RevenueTab";
import ForecastingTab from "./reports/ForecastingTab";
import AccountabilityTab from "./reports/AccountabilityTab";
import MeetingView from "./MeetingView";
import { hasPermission, type RoleLevel, type Permission } from "@/lib/permissions";

type ReportTab = "meetings" | "utilization" | "profitability" | "velocity" | "performance" | "revenue" | "forecasting" | "accountability";

const TABS: { value: ReportTab; label: string; icon: string; permission: Permission }[] = [
  { value: "meetings", label: "Meetings", icon: "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155", permission: "nav:reports" },
  { value: "utilization", label: "Utilization", icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", permission: "report:utilization" },
  { value: "profitability", label: "Profitability", icon: "M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z", permission: "report:profitability" },
  { value: "velocity", label: "Velocity", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z", permission: "report:velocity" },
  { value: "performance", label: "Performance", icon: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z", permission: "report:performance" },
  { value: "revenue", label: "Revenue", icon: "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", permission: "report:revenue" },
  { value: "forecasting", label: "Forecasting", icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5", permission: "report:forecasting" },
  { value: "accountability", label: "Accountability", icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 12.75l2.25 2.25L15 11.25", permission: "report:accountability" },
];

// Tabs that use the period selector
const PERIOD_TABS: ReportTab[] = ["utilization", "performance", "accountability"];

export default function ReportsPage({ roleLevel, teamMemberId }: { roleLevel?: RoleLevel; teamMemberId?: string | number }) {
  const visibleTabs = TABS.filter((tab) => !roleLevel || hasPermission(roleLevel, tab.permission));
  const [activeTab, setActiveTab] = useState<ReportTab>(visibleTabs[0]?.value ?? "utilization");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Compute initial date range
  const initialRange = getDateRange("this_month");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(initialRange);

  function handlePeriodChange(preset: PeriodPreset, start: string, end: string) {
    setPeriodPreset(preset);
    if (preset === "custom") {
      if (start && end) {
        setCustomStart(start);
        setCustomEnd(end);
        setDateRange({ start, end });
      }
    } else {
      setDateRange({ start, end });
    }
  }

  const showPeriodSelector = PERIOD_TABS.includes(activeTab);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center bg-[#F5F5F5] rounded-lg p-0.5">
          {visibleTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                activeTab === tab.value
                  ? "bg-[#1A1A1A] text-white shadow-sm"
                  : "text-[#6B7280] hover:text-[#1A1A1A]"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {showPeriodSelector && (
          <ReportPeriodSelector
            value={periodPreset}
            customStart={customStart}
            customEnd={customEnd}
            onChange={handlePeriodChange}
          />
        )}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "meetings" && (
          <MeetingView roleLevel={roleLevel || "employee"} teamMemberId={teamMemberId} />
        )}
        {activeTab === "utilization" && (
          <UtilizationTab start={dateRange.start} end={dateRange.end} />
        )}
        {activeTab === "profitability" && <ProfitabilityTab />}
        {activeTab === "velocity" && <VelocityTab />}
        {activeTab === "performance" && (
          <PerformanceTab start={dateRange.start} end={dateRange.end} />
        )}
        {activeTab === "revenue" && <RevenueTab />}
        {activeTab === "forecasting" && <ForecastingTab />}
        {activeTab === "accountability" && (
          <AccountabilityTab start={dateRange.start} end={dateRange.end} />
        )}
      </div>
    </div>
  );
}
