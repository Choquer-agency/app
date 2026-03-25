"use client";

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-green-100", text: "text-green-700", label: "Active" },
  sick: { bg: "bg-red-100", text: "text-red-700", label: "Sick Day" },
  "half-sick": { bg: "bg-amber-100", text: "text-amber-700", label: "Half Sick" },
  vacation: { bg: "bg-blue-100", text: "text-blue-700", label: "Vacation" },
  pending: { bg: "bg-amber-100", text: "text-amber-700", label: "Pending" },
  approved: { bg: "bg-green-100", text: "text-green-700", label: "Approved" },
  denied: { bg: "bg-red-100", text: "text-red-700", label: "Denied" },
};

export default function StatusBadge({ type }: { type: string }) {
  const style = BADGE_STYLES[type] ?? {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: type,
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
