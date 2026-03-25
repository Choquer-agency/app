"use client";

import React, { useState, useEffect } from "react";

interface TimePickerProps {
  value: string | null; // "HH:mm" (24-hour) or null
  onChange: (value: string) => void;
  label?: string;
}

export default function TimePicker({ value, onChange, label }: TimePickerProps) {
  // Convert 24-hour to 12-hour format with AM/PM
  const parseTime = (val: string | null) => {
    if (!val) return { h12: "", m: "", isPM: false };
    const [h24Str, m] = val.split(":");
    const h24 = parseInt(h24Str, 10);

    const isPM = h24 >= 12;
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12; // 0 -> 12 (midnight/noon)

    return { h12: h12.toString().padStart(2, "0"), m, isPM };
  };

  const parsed = parseTime(value);
  const [h12, setH12] = useState(parsed.h12);
  const [m, setM] = useState(parsed.m);
  const [isPM, setIsPM] = useState(parsed.isPM);

  // Sync with external value changes
  useEffect(() => {
    const parsed = parseTime(value);
    setH12(parsed.h12);
    setM(parsed.m);
    setIsPM(parsed.isPM);
  }, [value]);

  // Convert 12-hour + AM/PM to 24-hour format
  const emitChange = (newH12: string, newM: string, newIsPM: boolean) => {
    const h12Num = parseInt(newH12, 10);
    const mNum = parseInt(newM, 10);

    if (!isNaN(h12Num) && !isNaN(mNum)) {
      let h24 = h12Num % 12; // 12 -> 0
      if (newIsPM) h24 += 12;

      const formattedH = h24.toString().padStart(2, "0");
      const formattedM = Math.min(59, Math.max(0, mNum))
        .toString()
        .padStart(2, "0");
      onChange(`${formattedH}:${formattedM}`);
    }
  };

  const adjust = (type: "h" | "m", delta: number) => {
    let currentH = parseInt(h12 || "9", 10);
    let currentM = parseInt(m || "0", 10);
    let currentIsPM = isPM;

    if (isNaN(currentH)) currentH = 9;
    if (isNaN(currentM)) currentM = 0;

    if (type === "h") {
      currentH = currentH + delta;

      // Handle wrapping and AM/PM toggle
      if (currentH > 12) {
        currentH = 1;
        currentIsPM = !currentIsPM;
      } else if (currentH < 1) {
        currentH = 12;
        currentIsPM = !currentIsPM;
      }
    } else {
      currentM = (currentM + delta + 60) % 60;
    }

    const newH12Str = currentH.toString().padStart(2, "0");
    const newMStr = currentM.toString().padStart(2, "0");

    setH12(newH12Str);
    setM(newMStr);
    setIsPM(currentIsPM);
    emitChange(newH12Str, newMStr, currentIsPM);
  };

  const handleBlur = () => {
    let h12Num = parseInt(h12, 10);
    const mNum = parseInt(m, 10);

    if (!isNaN(h12Num)) {
      // Clamp to 1-12
      h12Num = Math.min(12, Math.max(1, h12Num));
      const safeH = h12Num.toString().padStart(2, "0");
      const safeM = isNaN(mNum)
        ? "00"
        : Math.min(59, Math.max(0, mNum)).toString().padStart(2, "0");
      setH12(safeH);
      setM(safeM);
      emitChange(safeH, safeM, isPM);
    }
  };

  const handleInputChange = (type: "h" | "m", val: string) => {
    if (!/^\d*$/.test(val)) return;
    if (val.length > 2) return;

    if (type === "h") {
      setH12(val);
    } else {
      setM(val);
    }
  };

  const toggleAMPM = () => {
    const newIsPM = !isPM;
    setIsPM(newIsPM);
    emitChange(h12, m, newIsPM);
  };

  // Button styles
  const btnClass =
    "w-full min-h-[44px] h-10 flex items-center justify-center bg-[#F7F6F3] text-[#C5C1B8] hover:bg-[#F0EEE6] hover:text-[#263926] rounded-lg transition-colors active:bg-[#E5E3DA]";
  const inputClass =
    "w-full text-center text-2xl md:text-3xl font-bold font-mono bg-transparent border-none focus:ring-0 p-0 text-[#263926] placeholder-[#F0EEE6]";

  return (
    <div className="flex flex-col w-full">
      {label && (
        <span className="mb-2 text-xs font-bold text-[#6B6B6B] uppercase tracking-wider">
          {label}
        </span>
      )}
      <div className="flex items-center justify-between gap-2 md:gap-3 p-3 md:p-4 bg-[#FCFBF8] border border-[#F6F5F1] rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        {/* Hour Column */}
        <div className="flex flex-col gap-1 flex-1 min-w-0 max-w-[72px] md:max-w-[80px]">
          <button
            onClick={() => adjust("h", 1)}
            className={btnClass}
            tabIndex={-1}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </button>
          <div className="py-1">
            <input
              type="text"
              inputMode="numeric"
              value={h12}
              onChange={(e) => handleInputChange("h", e.target.value)}
              onBlur={handleBlur}
              placeholder="12"
              className={inputClass}
            />
          </div>
          <button
            onClick={() => adjust("h", -1)}
            className={btnClass}
            tabIndex={-1}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 12H4"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-col justify-center h-full pb-1 flex-shrink-0">
          <span className="text-xl md:text-2xl font-bold text-[#E5E3DA]">
            :
          </span>
        </div>

        {/* Minute Column */}
        <div className="flex flex-col gap-1 flex-1 min-w-0 max-w-[72px] md:max-w-[80px]">
          <button
            onClick={() => adjust("m", 5)}
            className={btnClass}
            tabIndex={-1}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </button>
          <div className="py-1">
            <input
              type="text"
              inputMode="numeric"
              value={m}
              onChange={(e) => handleInputChange("m", e.target.value)}
              onBlur={handleBlur}
              placeholder="00"
              className={inputClass}
            />
          </div>
          <button
            onClick={() => adjust("m", -5)}
            className={btnClass}
            tabIndex={-1}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 12H4"
              />
            </svg>
          </button>
        </div>

        {/* AM/PM Toggle */}
        <div className="flex flex-col justify-center flex-shrink-0">
          <button
            onClick={toggleAMPM}
            className="px-3 md:px-4 py-2 md:py-3 min-h-[44px] bg-[#F7F6F3] hover:bg-[#F0EEE6] rounded-lg transition-colors text-sm md:text-base font-bold font-mono text-[#263926]"
          >
            {isPM ? "PM" : "AM"}
          </button>
        </div>
      </div>
    </div>
  );
}
