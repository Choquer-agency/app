"use client";

import { useState } from "react";
import MeetingView from "@/components/MeetingView";
import MeetingNotesIngestion from "@/components/MeetingNotesIngestion";

const TABS = [
  { id: "prep", label: "Meeting Prep" },
  { id: "notes", label: "Meeting Notes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MeetingsPageClient({
  roleLevel,
  teamMemberId,
}: {
  roleLevel: string;
  teamMemberId?: string | number;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("prep");

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-[var(--border)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-[1px] ${
              activeTab === tab.id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "prep" && <MeetingView roleLevel={roleLevel} teamMemberId={teamMemberId} />}
      {activeTab === "notes" && <MeetingNotesIngestion roleLevel={roleLevel} teamMemberId={teamMemberId} />}
    </div>
  );
}
