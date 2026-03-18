"use client";

const STAGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  lead: { bg: "bg-blue-100", text: "text-blue-700", label: "Lead" },
  onboarding: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Onboarding" },
  active: { bg: "bg-green-100", text: "text-green-700", label: "Active" },
  churned: { bg: "bg-red-100", text: "text-red-700", label: "Churned" },
};

interface LifecycleBadgeProps {
  stage: string;
  className?: string;
}

export default function LifecycleBadge({ stage, className = "" }: LifecycleBadgeProps) {
  const style = STAGE_STYLES[stage] || STAGE_STYLES.active;

  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text} ${className}`}
    >
      {style.label}
    </span>
  );
}
