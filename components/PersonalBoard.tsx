"use client";

import { useState, useEffect } from "react";
import TicketListView from "./TicketListView";
import ServiceBoardSummaryBanner from "./ServiceBoardSummaryBanner";
import { useSession } from "@/hooks/useSession";

export default function PersonalBoard() {
  const session = useSession();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.teamMemberId) {
      setUserId(session.teamMemberId);
    }
  }, [session]);

  if (!userId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <>
      <ServiceBoardSummaryBanner specialistId={userId} />
      <TicketListView assigneeId={userId} />
    </>
  );
}
