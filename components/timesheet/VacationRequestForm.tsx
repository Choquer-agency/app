"use client";

import { useState, useEffect } from "react";

export default function VacationRequestForm({
  teamMemberId,
  onSubmit,
  defaultOpen = false,
  onClose,
}: {
  teamMemberId: string;
  onSubmit: () => void;
  defaultOpen?: boolean;
  onClose?: () => void;
}) {
  const [isOpen, setIsOpenRaw] = useState(defaultOpen);
  const setIsOpen = (open: boolean) => {
    setIsOpenRaw(open);
    if (!open) onClose?.();
  };
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [vacationInfo, setVacationInfo] = useState<{ total: number; used: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/admin/team/me")
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data) {
            setVacationInfo({
              total: data.vacationDaysTotal ?? 10,
              used: data.vacationDaysUsed ?? 0,
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  function countBusinessDays(start: string, end: string): number {
    if (!start || !end) return 0;
    let count = 0;
    const d = new Date(start + "T12:00:00");
    const endD = new Date(end + "T12:00:00");
    while (d <= endD) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  const totalDays = countBusinessDays(startDate, endDate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || totalDays === 0) return;
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/timesheet/vacation/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, totalDays, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit");
        return;
      }
      setStartDate("");
      setEndDate("");
      setReason("");
      setIsOpen(false);
      onSubmit();
    } catch {
      setError("Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  // Button to open modal (matches Ollie's vacation request button style)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full py-3 md:py-4 text-white bg-sky-600 hover:bg-sky-700 rounded-2xl font-medium text-sm min-h-[48px] transition-colors"
      >
        ✈️ Request Vacation Day
      </button>
    );
  }

  // Full screen modal (matches Ollie's VacationRequestModal exactly)
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-end bg-[#484848]/40 backdrop-blur-sm transition-all"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <div className="h-full md:h-auto w-full md:max-w-md bg-white md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex justify-between items-center p-4 md:p-6 md:pb-0 bg-white border-b border-[#F6F5F1] md:border-b-0">
          <h2 className="text-xl font-bold text-[#1A1A1A]">
            Request Vacation
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-[#6B6B6B] hover:text-[#1A1A1A] p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <svg
              className="w-8 h-8 md:w-6 md:h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 md:pt-4">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm rounded-2xl border border-rose-100">
              {error}
            </div>
          )}

          <form id="vacation-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Vacation Balance Card */}
            {vacationInfo && (
              <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold text-sky-700 uppercase mb-1">Vacation Balance</h3>
                    <div className="text-lg font-bold text-sky-900">
                      {Math.max(0, vacationInfo.total - vacationInfo.used)} days remaining
                    </div>
                  </div>
                  <div className="text-sm text-sky-600">
                    {vacationInfo.used} / {vacationInfo.total} used
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 bg-[#F6F5F1]/30 rounded-2xl border border-[#F6F5F1]">
              <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                  setError("");
                }}
                min={new Date().toISOString().split("T")[0]}
                className="w-full p-3 bg-white border border-[#F6F5F1] rounded-xl focus:ring-2 focus:ring-[#FF9500] outline-none text-base text-[#1A1A1A]"
                required
              />
            </div>

            <div className="p-4 bg-[#F6F5F1]/30 rounded-2xl border border-[#F6F5F1]">
              <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setError("");
                }}
                min={startDate || new Date().toISOString().split("T")[0]}
                className="w-full p-3 bg-white border border-[#F6F5F1] rounded-xl focus:ring-2 focus:ring-[#FF9500] outline-none text-base text-[#1A1A1A]"
                required
              />
            </div>

            <div className="p-4 bg-[#F6F5F1]/30 rounded-2xl border border-[#F6F5F1]">
              <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-2">
                Reason (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Family vacation"
                className="w-full p-3 bg-white border border-[#F6F5F1] rounded-xl focus:ring-2 focus:ring-[#FF9500] outline-none text-base text-[#1A1A1A] placeholder:text-[#6B6B6B]"
              />
            </div>

            {totalDays > 0 && (
              <div className="p-4 bg-[#F6F5F1] rounded-2xl">
                <p className="text-sm text-[#1A1A1A]">
                  <span className="font-bold">{totalDays}</span> day
                  {totalDays === 1 ? "" : "s"} requested
                </p>
              </div>
            )}
          </form>
        </div>

        {/* Footer Actions */}
        <div className="flex-shrink-0 flex gap-3 p-4 md:p-6 bg-white border-t border-[#F6F5F1]">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            disabled={submitting}
            className="flex-1 min-h-[48px] px-4 py-3 border border-[#F6F5F1] text-[#1A1A1A] rounded-2xl font-medium text-sm hover:bg-[#F6F5F1] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="vacation-form"
            disabled={submitting || totalDays === 0}
            className="flex-1 min-h-[48px] px-4 py-3 bg-[#FF9500] text-white rounded-2xl font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Requesting..." : "Request Vacation"}
          </button>
        </div>
      </div>
    </div>
  );
}
