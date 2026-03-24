"use client";

import { useState, useEffect } from "react";
import TicketListView from "./TicketListView";
import ServiceBoardSummaryBanner from "./ServiceBoardSummaryBanner";

export default function PersonalBoard() {
  const [memberId, setMemberId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((data: { teamMemberId: number }) => {
        setMemberId(data.teamMemberId);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !memberId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <>
      <ServiceBoardSummaryBanner />
      <TicketListView assigneeId={memberId} />
    </>
  );
}
