"use client";

import { ConnectionStatus } from "@/types";

const STATUS_STYLES: Record<ConnectionStatus, { label: string; classes: string }> = {
  active: { label: "Connected", classes: "bg-[#BDFFE8] text-[#0d5a3f]" },
  expired: { label: "Expired", classes: "bg-[#FFF09E] text-[#6b5f00]" },
  error: { label: "Error", classes: "bg-[#FFB1B1] text-[#7a1a1a]" },
  disconnected: { label: "Not Connected", classes: "bg-gray-100 text-gray-500" },
};

export default function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.disconnected;
  return (
    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${style.classes}`}>
      {style.label}
    </span>
  );
}
