"use client";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-[#BDFFE8]", text: "text-[#0d7a55]", label: "New" },
  active: { bg: "bg-[#B1D0FF]", text: "text-[#1a56db]", label: "Active" },
  offboarding: { bg: "bg-[#FFA69E]", text: "text-[#b91c1c]", label: "Offboarding" },
};

interface ClientStatusBadgeProps {
  status: string;
  className?: string;
}

export default function ClientStatusBadge({ status, className = "" }: ClientStatusBadgeProps) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.active;

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${style.bg} ${style.text} ${className}`}
    >
      {style.label}
    </span>
  );
}
