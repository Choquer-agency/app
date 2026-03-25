"use client";

const ISSUE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  MISSING_CLOCK_OUT: { bg: "bg-red-100", text: "text-red-700", label: "Missing Clock-Out" },
  LONG_SHIFT_NO_BREAK: { bg: "bg-amber-100", text: "text-amber-700", label: "No Break" },
  OPEN_BREAK: { bg: "bg-amber-100", text: "text-amber-700", label: "Open Break" },
  OVERTIME_WARNING: { bg: "bg-purple-100", text: "text-purple-700", label: "Overtime" },
};

export default function IssueBadge({ issue }: { issue: string }) {
  const style = ISSUE_STYLES[issue] ?? {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: issue,
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
