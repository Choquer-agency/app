"use client";

import TicketListView from "./TicketListView";
import ServiceBoardSummaryBanner from "./ServiceBoardSummaryBanner";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function PersonalBoard() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <>
      <ServiceBoardSummaryBanner specialistId={user.id} />
      <TicketListView assigneeId={user.id} />
    </>
  );
}
