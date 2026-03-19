"use client";

import { useState, useEffect } from "react";

interface GoalIssue {
  clientName: string;
  clientSlug: string;
  goal: string;
  issue: string;
  severity: "warning" | "error";
}

interface ApprovalNotification {
  id: number;
  clientName: string;
  clientSlug: string;
  title: string;
  status: "approved" | "rejected";
  feedback: string | null;
  actedAt: string;
}

interface BirthdayNotification {
  name: string;
  daysUntil: number;
  isToday: boolean;
  birthdayDisplay: string;
}

interface AnniversaryNotification {
  name: string;
  daysUntil: number;
  isToday: boolean;
  years: number;
  anniversaryDisplay: string;
}

export default function GoalIssuesPanel() {
  const [issues, setIssues] = useState<GoalIssue[]>([]);
  const [approvals, setApprovals] = useState<ApprovalNotification[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayNotification[]>([]);
  const [anniversaries, setAnniversaries] = useState<AnniversaryNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/issues")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        setIssues(data.issues || []);
        setApprovals(data.approvalNotifications || []);
        setBirthdays(data.birthdayNotifications || []);
        setAnniversaries(data.anniversaryNotifications || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function dismissApproval(id: number) {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    fetch(`/api/admin/notifications/${id}`, { method: "DELETE" }).catch(() => {});
  }

  if (loading) return null;
  if (issues.length === 0 && approvals.length === 0 && birthdays.length === 0 && anniversaries.length === 0) return null;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const celebrationCount = birthdays.length + anniversaries.length;
  const totalCount = issues.length + approvals.length + celebrationCount;

  return (
    <div className="mb-6 bg-[#FFF8F0] border border-[#FFD0A0] rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[#FFF0E0] transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">&#x1F514;</span>
          <span className="text-sm font-semibold text-[#8B4513]">
            Notifications
          </span>
          <span className="text-[10px] bg-[#8B4513] text-white px-2 py-0.5 rounded-full font-medium">
            {totalCount}
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
          {approvals.filter((a) => a.status === "approved").length > 0 && (
            <span className="text-[10px] bg-[#BDFFE8] text-[#0d5a3f] px-2 py-0.5 rounded-full font-medium">
              {approvals.filter((a) => a.status === "approved").length} approved
            </span>
          )}
          {approvals.filter((a) => a.status === "rejected").length > 0 && (
            <span className="text-[10px] bg-[#FFA69E] text-[#7f1d1d] px-2 py-0.5 rounded-full font-medium">
              {approvals.filter((a) => a.status === "rejected").length} changes requested
            </span>
          )}
          {celebrationCount > 0 && (
            <span className="text-[10px] bg-[#FFE0B2] text-[#E65100] px-2 py-0.5 rounded-full font-medium">
              {(birthdays.some((b) => b.isToday) || anniversaries.some((a) => a.isToday)) ? "\uD83C\uDF89" : "\uD83D\uDCC5"} {celebrationCount} {celebrationCount === 1 ? "celebration" : "celebrations"}
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
            {/* Birthday notifications */}
            {birthdays.map((bday, i) => (
              <div
                key={`bday-${i}`}
                className={`flex items-start gap-3 text-xs px-3 py-2 rounded-lg ${
                  bday.isToday
                    ? "bg-[#FFF5E6] border border-[#FFB74D]"
                    : "bg-[#F3F0FF] border border-[#D1C4E9]"
                }`}
              >
                <span className="mt-0.5 shrink-0 text-sm">{bday.isToday ? "\uD83C\uDF82" : "\uD83C\uDF89"}</span>
                <div className="min-w-0 flex-1">
                  {bday.isToday ? (
                    <span className="font-semibold text-[#E65100]">
                      Today is {bday.name}&apos;s birthday! Happy birthday! &#127881;
                    </span>
                  ) : (
                    <span className="text-[#4A148C]">
                      <span className="font-semibold">{bday.name}</span>&apos;s birthday is {bday.birthdayDisplay}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Anniversary notifications */}
            {anniversaries.map((anniv, i) => (
              <div
                key={`anniv-${i}`}
                className={`flex items-start gap-3 text-xs px-3 py-2 rounded-lg ${
                  anniv.isToday
                    ? "bg-[#FFF5E6] border border-[#FFB74D]"
                    : "bg-[#F3F0FF] border border-[#D1C4E9]"
                }`}
              >
                <span className="mt-0.5 shrink-0 text-sm">{anniv.isToday ? "\u2B50" : "\uD83D\uDCC5"}</span>
                <div className="min-w-0 flex-1">
                  {anniv.isToday ? (
                    <span className="font-semibold text-[#E65100]">
                      Today is {anniv.name}&apos;s {anniv.years}-year work anniversary! Congratulations! &#11088;
                    </span>
                  ) : (
                    <span className="text-[#4A148C]">
                      <span className="font-semibold">{anniv.name}</span>&apos;s {anniv.years}-year work anniversary is {anniv.anniversaryDisplay}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Approval notifications (dismissible) */}
            {approvals.map((approval) => (
              <div
                key={`approval-${approval.id}`}
                className={`flex items-start gap-3 text-xs px-3 py-2 rounded-lg ${
                  approval.status === "rejected"
                    ? "bg-[#FFF0F0] border border-[#FFA69E]"
                    : "bg-[#EEFFF7] border border-[#BDFFE8]"
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${approval.status === "rejected" ? "text-[#D94040]" : "text-[#0d7a55]"}`}>
                  {approval.status === "rejected" ? "\u2716" : "\u2714"}
                </span>
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-semibold text-[#1A1A1A]">{approval.clientName}</span>
                    <span className={`ml-1 ${approval.status === "rejected" ? "text-[#7f1d1d]" : "text-[#0d5a3f]"}`}>
                      {approval.status === "rejected" ? "requested changes on" : "approved"} &ldquo;{approval.title}&rdquo;
                    </span>
                  </div>
                  {approval.status === "rejected" && approval.feedback && (
                    <p className="mt-1 text-[#555] bg-white/60 rounded px-2 py-1 border border-[#FFD4D4]">
                      &ldquo;{approval.feedback}&rdquo;
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismissApproval(approval.id)}
                  className="shrink-0 mt-0.5 text-[#999] hover:text-[#333] transition"
                  title="Dismiss"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Goal issues (non-dismissible) */}
            {issues.map((issue, i) => (
              <div
                key={`issue-${i}`}
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
