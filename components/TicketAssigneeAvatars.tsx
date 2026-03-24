"use client";

import { TicketAssignee } from "@/types";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function TicketAssigneeAvatars({
  assignees,
  max = 4,
  size = "md",
}: {
  assignees: TicketAssignee[];
  max?: number;
  size?: "md" | "sm";
}) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-[var(--muted)] text-xs">—</span>;
  }

  const shown = assignees.slice(0, max);
  const overflow = assignees.length - max;
  const dim = size === "sm" ? 28 : 32;

  return (
    <div className="flex items-center" style={{ marginLeft: shown.length > 1 ? 4 : 0 }}>
      {shown.map((a, i) => (
        <div
          key={a.id}
          title={a.memberName || "Assignee"}
          className="rounded-full flex items-center justify-center font-bold shrink-0 overflow-hidden"
          style={{
            width: dim,
            height: dim,
            backgroundColor: a.memberColor || "#e5e7eb",
            color: a.memberColor ? "#fff" : "#6b7280",
            fontSize: size === "sm" ? 10 : 11,
            border: "2.5px solid white",
            marginLeft: i > 0 ? -8 : 0,
            zIndex: shown.length - i,
            position: "relative",
            boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08)",
          }}
        >
          {a.memberProfilePicUrl ? (
            <img
              src={a.memberProfilePicUrl}
              alt={a.memberName || ""}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            getInitials(a.memberName || "?")
          )}
        </div>
      ))}
      {overflow > 0 && (
        <span
          className="text-[var(--muted)] font-medium shrink-0 ml-1"
          style={{ fontSize: size === "sm" ? 10 : 11 }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
