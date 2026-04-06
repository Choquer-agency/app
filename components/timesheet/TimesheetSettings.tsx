"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

interface Settings {
  halfDaySickCutoffTime: string;
  overtimeThresholdMinutes: number;
  longShiftBreakThresholdMinutes: number;
  defaultVacationDaysPerYear: number;
  bookkeeperEmail?: string;
  standardWorkDayHours?: number;
}

export default function TimesheetSettings() {
  const settingsDoc = useQuery(api.timesheetSettings.get);
  const updateSettings = useMutation(api.timesheetSettings.update);

  const [localSettings, setLocalSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Sync Convex data into local state for editing
  useEffect(() => {
    if (settingsDoc && !localSettings) {
      setLocalSettings({
        halfDaySickCutoffTime: settingsDoc.halfDaySickCutoffTime,
        overtimeThresholdMinutes: settingsDoc.overtimeThresholdMinutes,
        longShiftBreakThresholdMinutes: settingsDoc.longShiftBreakThresholdMinutes,
        defaultVacationDaysPerYear: settingsDoc.defaultVacationDaysPerYear,
        bookkeeperEmail: settingsDoc.bookkeeperEmail,
        standardWorkDayHours: settingsDoc.standardWorkDayHours,
      });
    }
  }, [settingsDoc, localSettings]);

  async function handleSave() {
    if (!localSettings) return;
    setSaving(true);
    setMessage("");
    try {
      await updateSettings({
        halfDaySickCutoffTime: localSettings.halfDaySickCutoffTime,
        overtimeThresholdMinutes: localSettings.overtimeThresholdMinutes,
        longShiftBreakThresholdMinutes: localSettings.longShiftBreakThresholdMinutes,
        defaultVacationDaysPerYear: localSettings.defaultVacationDaysPerYear,
        bookkeeperEmail: localSettings.bookkeeperEmail,
        standardWorkDayHours: localSettings.standardWorkDayHours,
      });
      setMessage("Settings saved!");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const loading = settingsDoc === undefined;

  if (loading) {
    return (
      <div className="py-8 text-center text-[#6B6B6B]">Loading settings...</div>
    );
  }

  if (!localSettings) {
    return (
      <div className="py-8 text-center text-[#6B6B6B]">Failed to load settings.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] p-6">
        <h3 className="text-base font-bold text-[#1A1A1A] mb-4">General</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Bookkeeper Email
            </label>
            <input
              type="email"
              value={localSettings.bookkeeperEmail || ""}
              onChange={(e) => setLocalSettings({ ...localSettings, bookkeeperEmail: e.target.value })}
              placeholder="payroll@company.com"
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Standard Work Day (hours)
            </label>
            <input
              type="number"
              value={localSettings.standardWorkDayHours ?? 8}
              onChange={(e) => setLocalSettings({ ...localSettings, standardWorkDayHours: parseFloat(e.target.value) })}
              min={1}
              max={24}
              step={0.5}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] border border-[#F6F5F1] p-6">
        <h3 className="text-base font-bold text-[#1A1A1A] mb-4">Time Rules</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Half-Day Sick Cutoff Time
            </label>
            <input
              type="time"
              value={localSettings.halfDaySickCutoffTime}
              onChange={(e) => setLocalSettings({ ...localSettings, halfDaySickCutoffTime: e.target.value })}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Overtime Threshold (minutes)
            </label>
            <input
              type="number"
              value={localSettings.overtimeThresholdMinutes}
              onChange={(e) => setLocalSettings({ ...localSettings, overtimeThresholdMinutes: parseInt(e.target.value) })}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none"
            />
            <p className="text-xs text-[#6B6B6B] mt-1">Default: 480 (8 hours)</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Break Required After (minutes)
            </label>
            <input
              type="number"
              value={localSettings.longShiftBreakThresholdMinutes}
              onChange={(e) => setLocalSettings({ ...localSettings, longShiftBreakThresholdMinutes: parseInt(e.target.value) })}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none"
            />
            <p className="text-xs text-[#6B6B6B] mt-1">Default: 300 (5 hours)</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#6B6B6B] uppercase mb-1.5">
              Default Vacation Days Per Year
            </label>
            <input
              type="number"
              value={localSettings.defaultVacationDaysPerYear}
              onChange={(e) => setLocalSettings({ ...localSettings, defaultVacationDaysPerYear: parseInt(e.target.value) })}
              className="w-full p-3 bg-white border border-[#F6F5F1] rounded-2xl text-sm text-[#1A1A1A] focus:ring-2 focus:ring-[#FF9500] outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-[#FF9500] text-white rounded-lg font-medium text-sm hover:bg-[#E68600] transition-colors disabled:opacity-50"
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
