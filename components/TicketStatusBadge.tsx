"use client";

import { TicketStatus } from "@/types";

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string; dot: string }> = {
  needs_attention: { label: "Needs Attention", bg: "bg-orange-100", text: "text-orange-700", dot: "#f97316" },
  stuck: { label: "Stuck", bg: "bg-red-100", text: "text-red-700", dot: "#ef4444" },
  in_progress: { label: "In Progress", bg: "bg-blue-100", text: "text-blue-700", dot: "#3b82f6" },
  qa_ready: { label: "QA Ready", bg: "bg-purple-100", text: "text-purple-700", dot: "#a855f7" },
  client_review: { label: "Client Review", bg: "bg-yellow-100", text: "text-yellow-700", dot: "#eab308" },
  approved_go_live: { label: "Approved / Go Live", bg: "bg-green-100", text: "text-green-700", dot: "#22c55e" },
  closed: { label: "Closed", bg: "bg-green-100", text: "text-green-700", dot: "#22c55e" },
};

export const STATUS_ORDER: TicketStatus[] = [
  "needs_attention",
  "stuck",
  "in_progress",
  "qa_ready",
  "client_review",
  "approved_go_live",
  "closed",
];

export function getStatusLabel(status: TicketStatus): string {
  return STATUS_CONFIG[status]?.label || status;
}

export function getStatusColor(status: TicketStatus): string {
  const config = STATUS_CONFIG[status];
  return config ? `${config.bg} ${config.text}` : "bg-gray-100 text-gray-500";
}

export function getStatusDotColor(status: TicketStatus): string {
  return STATUS_CONFIG[status]?.dot || "#9ca3af";
}

/** Small colored circle indicator for status */
export function StatusDot({ status, size = 10 }: { status: TicketStatus; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: getStatusDotColor(status),
      }}
    />
  );
}

export default function TicketStatusBadge({
  status,
  size = "sm",
}: {
  status: TicketStatus;
  size?: "sm" | "xs" | "lg";
}) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full whitespace-nowrap ${config.bg} ${config.text} ${
        size === "xs"
          ? "px-2 py-0.5 text-[10px]"
          : size === "lg"
          ? "px-3.5 py-1.5 text-sm"
          : "px-2.5 py-1 text-xs"
      }`}
    >
      <span
        className="inline-block rounded-full shrink-0"
        style={{
          width: size === "lg" ? 8 : 6,
          height: size === "lg" ? 8 : 6,
          backgroundColor: config.dot,
        }}
      />
      {config.label}
    </span>
  );
}
