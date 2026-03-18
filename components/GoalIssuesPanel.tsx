"use client";

import { useState, useEffect } from "react";

interface GoalIssue {
  clientName: string;
  clientSlug: string;
  goal: string;
  issue: string;
  severity: "warning" | "error";
}

export default function GoalIssuesPanel() {
  const [issues, setIssues] = useState<GoalIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/issues")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => setIssues(data.issues || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="mb-6 bg-[#FFF8F0] border border-[#FFD0A0] rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[#FFF0E0] transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">&#x26A0;&#xFE0F;</span>
          <span className="text-sm font-semibold text-[#8B4513]">
            Goal Issues
          </span>
          {errors.length > 0 && (
            <span className="text-[10px] bg-[#FFA69E] text-[#7f1d1d] px-2 py-0.5 rounded-full font-medium">
              {errors.length} {errors.length === 1 ? "error" : "errors"}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-[10px] bg-[#FFE4A0] text-[#78600d] px-2 py-0.5 rounded-full font-medium">
              {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-[#8B4513] transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-5 pb-4">
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 text-xs px-3 py-2 rounded-lg ${
                  issue.severity === "error"
                    ? "bg-[#FFF0F0] border border-[#FFA69E]"
                    : "bg-[#FFFBE6] border border-[#FFE4A0]"
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {issue.severity === "error" ? "\u2716" : "\u26A0"}
                </span>
                <div className="min-w-0">
                  <span className="font-semibold text-[#1A1A1A]">{issue.clientName}</span>
                  {issue.goal !== "—" && (
                    <span className="text-[#666] ml-1">— {issue.goal}</span>
                  )}
                  <p className="text-[#555] mt-0.5">{issue.issue}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
