"use client";

import { useState, useCallback } from "react";

interface CopyFieldProps {
  value: string;
  label?: string;
  className?: string;
}

export default function CopyField({ value, label, className = "" }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  if (!value) return <span className="text-gray-300">--</span>;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`group inline-flex items-center gap-1.5 text-left hover:text-[#FF9500] transition ${className}`}
      title={`Click to copy${label ? ` ${label}` : ""}`}
    >
      <span className="truncate">{value}</span>
      <span className="shrink-0 text-[10px] font-medium text-gray-300 group-hover:text-[#FF9500] transition">
        {copied ? (
          <span className="text-green-500">Copied!</span>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" />
          </svg>
        )}
      </span>
    </button>
  );
}
