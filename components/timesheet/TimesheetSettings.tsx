"use client";

import { useState, useEffect } from "react";

interface Settings {
  halfDaySickCutoffTime: string;
  overtimeThresholdMinutes: number;
  longShiftBreakThresholdMinutes: number;
  defaultVacationDaysPerYear: number;
  bookkeeperEmail?: string;
  standardWorkDayHours?: number;
}

export default function TimesheetSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/timesheet/settings")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) setSettings(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/timesheet/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setMessage("Settings saved!");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("Failed to save settings.");
      }
    } catch {
      setMessage("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-[#6B6B6B]">Loading settings...</div>
    );
  }

  if (!settings) {
    return (
      <div className="py-8 text-center text-[#6B6B6B]">Failed to load settings.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] p-6">
        <h3 className="text-base font-bold text-[#263926] mb-4">General</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Bookkeeper Email
            </label>
            <input
              type="email"
              value={settings.bookkeeperEmail || ""}
              onChange={(e) => setSettings({ ...settings, bookkeeperEmail: e.target.value })}
              placeholder="payroll@company.com"
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#263926] focus:ring-2 focus:ring-[#2CA01C] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Standard Work Day (hours)
            </label>
            <input
              type="number"
              value={settings.standardWorkDayHours ?? 8}
              onChange={(e) => setSettings({ ...settings, standardWorkDayHours: parseFloat(e.target.value) })}
              min={1}
              max={24}
              step={0.5}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#263926] focus:ring-2 focus:ring-[#2CA01C] outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] p-6">
        <h3 className="text-base font-bold text-[#263926] mb-4">Time Rules</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Half-Day Sick Cutoff Time
            </label>
            <input
              type="time"
              value={settings.halfDaySickCutoffTime}
              onChange={(e) => setSettings({ ...settings, halfDaySickCutoffTime: e.target.value })}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#263926] focus:ring-2 focus:ring-[#2CA01C] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Overtime Threshold (minutes)
            </label>
            <input
              type="number"
              value={settings.overtimeThresholdMinutes}
              onChange={(e) => setSettings({ ...settings, overtimeThresholdMinutes: parseInt(e.target.value) })}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#263926] focus:ring-2 focus:ring-[#2CA01C] outline-none"
            />
            <p className="text-xs text-[#6B6B6B] mt-1">Default: 480 (8 hours)</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Break Required After (minutes)
            </label>
            <input
              type="number"
              value={settings.longShiftBreakThresholdMinutes}
              onChange={(e) => setSettings({ ...settings, longShiftBreakThresholdMinutes: parseInt(e.target.value) })}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#263926] focus:ring-2 focus:ring-[#2CA01C] outline-none"
            />
            <p className="text-xs text-[#6B6B6B] mt-1">Default: 300 (5 hours)</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Default Vacation Days Per Year
            </label>
            <input
              type="number"
              value={settings.defaultVacationDaysPerYear}
              onChange={(e) => setSettings({ ...settings, defaultVacationDaysPerYear: parseInt(e.target.value) })}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#263926] focus:ring-2 focus:ring-[#2CA01C] outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-[#2CA01C] text-white rounded-full font-medium text-sm hover:bg-[#248a17] transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {message && (
          <span className={`text-sm font-medium ${message.includes("Failed") ? "text-rose-600" : "text-emerald-600"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
