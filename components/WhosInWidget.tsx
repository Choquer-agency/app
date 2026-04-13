"use client";

import { useState, useEffect, useCallback } from "react";

interface TeamMemberStatus {
  id: string;
  name: string;
  profilePicUrl: string | null;
  color: string | null;
  role: string;
  status: "idle" | "break" | "offline" | "done";
  clockInTime: string | null;
}

const STATUS_CONFIG: Record<
  TeamMemberStatus["status"],
  { dot: string; label: string; text: string }
> = {
  idle: {
    dot: "bg-yellow-400",
    label: "Available",
    text: "text-yellow-700",
  },
  break: {
    dot: "bg-orange-400",
    label: "On Break",
    text: "text-orange-700",
  },
  done: {
    dot: "bg-gray-300",
    label: "Done for today",
    text: "text-gray-500",
  },
  offline: {
    dot: "bg-gray-300",
    label: "Offline",
    text: "text-gray-400",
  },
};

export default function WhosInWidget() {
  const [team, setTeam] = useState<TeamMemberStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/team/status");
      if (res.ok) {
        const data = await res.json();
        setTeam(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Listen for timer/clock changes
  useEffect(() => {
    function handleChange() {
      fetchStatus();
    }
    window.addEventListener("timerChange", handleChange);
    return () => window.removeEventListener("timerChange", handleChange);
  }, [fetchStatus]);

  const activeCount = team.filter(
    (m) => m.status === "idle" || m.status === "break"
  ).length;

  if (loading) {
    return (
      <div className="rounded-2xl bg-[#F5F0FF] p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">👥</span>
          <h2 className="text-sm font-bold text-[#4a2d8a]">Who&apos;s In</h2>
        </div>
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#7c5cbf]" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#F5F0FF] overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">👥</span>
          <div>
            <h2 className="text-sm font-bold text-[#4a2d8a]">Who&apos;s In</h2>
            <p className="text-[10px] text-[#4a2d8a]/60">
              {activeCount} of {team.length} clocked in
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-1.5">
        {team.map((member) => {
          const config = STATUS_CONFIG[member.status];

          return (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/60 hover:bg-white/80 transition"
            >
              {/* Status dot */}
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${config.dot}`}
                />
              </span>

              {/* Avatar */}
              {member.profilePicUrl ? (
                <img
                  src={member.profilePicUrl}
                  alt={member.name}
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{
                    backgroundColor: member.color || "#7c5cbf",
                  }}
                >
                  {member.name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Name + status info */}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--foreground)] truncate">
                  {member.name}
                </p>
                <p className={`text-[10px] truncate ${config.text}`}>
                  {member.status === "idle" && member.clockInTime
                    ? `Since ${new Date(member.clockInTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`
                    : config.label}
                </p>
              </div>
            </div>
          );
        })}

        {team.length === 0 && (
          <p className="text-xs text-[#4a2d8a]/60 text-center py-4">
            No team members found
          </p>
        )}
      </div>
    </div>
  );
}
