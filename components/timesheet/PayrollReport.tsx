"use client";

import { useState, useEffect } from "react";
import type { PayrollReportEntry } from "@/types";

function formatDuration(minutes: number) {
  if (!minutes || minutes <= 0) return "0h 0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function PayrollReport() {
  const [report, setReport] = useState<PayrollReportEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
  });

  async function fetchReport() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/timesheet/report?startDate=${dateRange.start}&endDate=${dateRange.end}`);
      if (res.ok) setReport(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }

  useEffect(() => { fetchReport(); }, [dateRange]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/timesheet/report?startDate=${dateRange.start}&endDate=${dateRange.end}&format=csv`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `payroll-${dateRange.start}-to-${dateRange.end}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally { setExporting(false); }
  }

  function setPreset(preset: string) {
    const now = new Date();
    let start: Date, end: Date;
    switch (preset) {
      case "this-month": start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now.getFullYear(), now.getMonth() + 1, 0); break;
      case "last-month": start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break;
      case "this-year": start = new Date(now.getFullYear(), 0, 1); end = now; break;
      default: return;
    }
    setDateRange({ start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] });
  }

  const totalHours = report.reduce((sum, r) => sum + r.totalWorkedMinutes, 0);
  const totalSick = report.reduce((sum, r) => sum + r.sickDays, 0);
  const totalVacation = report.reduce((sum, r) => sum + r.vacationDays, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards (matches Ollie's period summary) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-[#F6F5F1] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h3 className="text-xs font-bold uppercase text-[#6B6B6B] mb-1">Total Hours</h3>
          <div className="text-2xl md:text-3xl font-bold text-[#1A1A1A]">{formatDuration(totalHours)}</div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-[#F6F5F1] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h3 className="text-xs font-bold uppercase text-[#6B6B6B] mb-1">Team Members</h3>
          <div className="text-2xl md:text-3xl font-bold text-[#1A1A1A]">{report.length}</div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-[#F6F5F1] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <h3 className="text-xs font-bold uppercase text-[#6B6B6B] mb-1">Est. Payroll</h3>
          <div className="text-2xl md:text-3xl font-bold text-[#1A1A1A]">
            ${report.reduce((sum, r) => sum + (r.hourlyRate ?? 0) * r.totalWorkedDecimalHours, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Date Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">From</label>
          <input type="date" value={dateRange.start} onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))}
            className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">To</label>
          <input type="date" value={dateRange.end} onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))}
            className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["this-month", "last-month", "this-year"].map((p) => (
          <button key={p} onClick={() => setPreset(p)}
            className="px-3 py-1.5 text-xs border border-[#F6F5F1] rounded-full hover:bg-[#F6F5F1] transition-colors text-[#6B6B6B]">
            {p.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </button>
        ))}
        <button onClick={handleExport} disabled={exporting || report.length === 0}
          className="ml-auto px-4 py-1.5 text-xs bg-[#FF9500] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      {/* Report Table */}
      <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-[#6B6B6B]">Loading...</div>
        ) : report.length === 0 ? (
          <div className="py-12 text-center text-[#6B6B6B]">No data for this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Employee</th>
                  <th className="px-2 py-2.5 text-left font-medium text-[var(--muted)] text-xs whitespace-nowrap">Rate</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Hours</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Decimal</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Sick</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">Vacation</th>
                  <th className="px-2 py-2.5 text-right font-medium text-[var(--muted)] text-xs whitespace-nowrap">OT</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row) => (
                  <tr key={row.teamMemberId} className="border-b border-[var(--border)] hover:bg-[var(--hover-tan)] transition-colors">
                    <td className="px-2 py-3 font-medium text-[#1A1A1A]">{row.memberName}</td>
                    <td className="px-2 py-3 text-[#1A1A1A]">{row.hourlyRate ? `$${row.hourlyRate}/hr` : "—"}</td>
                    <td className="px-2 py-3 text-right font-medium text-[#1A1A1A]">{formatDuration(row.totalWorkedMinutes)}</td>
                    <td className="px-2 py-3 text-right text-[#6B6B6B] font-mono">{row.totalWorkedDecimalHours}</td>
                    <td className="px-2 py-3 text-right text-[#1A1A1A]">{row.sickDays + row.halfSickDays * 0.5}</td>
                    <td className="px-2 py-3 text-right text-[#1A1A1A]">{row.vacationDays}</td>
                    <td className="px-2 py-3 text-right">{row.overtimeDays > 0 ? <span className="text-amber-600 font-bold">{row.overtimeDays}</span> : <span className="text-[#6B6B6B]">0</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)]">
                  <td className="px-2 py-3 font-bold text-[#1A1A1A]">Total</td>
                  <td className="px-2 py-3" />
                  <td className="px-2 py-3 text-right font-bold text-[#1A1A1A]">{formatDuration(totalHours)}</td>
                  <td className="px-2 py-3 text-right font-bold text-[#1A1A1A] font-mono">{Math.round((totalHours / 60) * 100) / 100}</td>
                  <td className="px-2 py-3 text-right font-bold text-[#1A1A1A]">{totalSick}</td>
                  <td className="px-2 py-3 text-right font-bold text-[#1A1A1A]">{totalVacation}</td>
                  <td className="px-2 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
