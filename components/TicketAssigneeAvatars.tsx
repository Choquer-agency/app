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
  activeMemberIds,
}: {
  assignees: TicketAssignee[];
  max?: number;
  size?: "md" | "sm";
  activeMemberIds?: ReadonlySet<string>;
}) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-[var(--muted)] text-xs">—</span>;
  }

  const shown = assignees.slice(0, max);
  const overflow = assignees.length - max;
  const dim = size === "sm" ? 28 : 32;

  return (
    <div className="flex items-center" style={{ marginLeft: shown.length > 1 ? 4 : 0 }}>
      {shown.map((a, i) => {
        const isActive = activeMemberIds?.has(String(a.teamMemberId)) ?? false;
        return (
          <div
            key={a.id}
            className="shrink-0"
            style={{
              position: "relative",
              marginLeft: i > 0 ? -8 : 0,
              zIndex: shown.length - i,
            }}
          >
            <div
              title={isActive ? `${a.memberName || "Assignee"} — tracking time` : a.memberName || "Assignee"}
              className="rounded-full flex items-center justify-center font-bold overflow-hidden"
              style={{
                width: dim,
                height: dim,
                backgroundColor: a.memberColor || "#e5e7eb",
                color: a.memberColor ? "#fff" : "#6b7280",
                fontSize: size === "sm" ? 10 : 11,
                border: "2.5px solid white",
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
            {isActive && (
              <span
                aria-label="Actively tracking time"
                className="animate-timer-pulse"
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: size === "sm" ? 9 : 10,
                  height: size === "sm" ? 9 : 10,
                  borderRadius: "50%",
                  backgroundColor: "#ef4444",
                  border: "1.5px solid white",
                }}
              />
            )}
          </div>
        );
      })}
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
