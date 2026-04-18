"use client";

import TicketListView from "./TicketListView";
import ServiceBoardSummaryBanner from "./ServiceBoardSummaryBanner";
import PersonalAccountabilitySnapshot from "./PersonalAccountabilitySnapshot";
import { useSession } from "@/hooks/useSession";

export default function PersonalBoard() {
  const session = useSession();

  if (!session) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <>
      <PersonalAccountabilitySnapshot teamMemberId={session.teamMemberId} />
      <ServiceBoardSummaryBanner specialistId={session.teamMemberId} />
      <TicketListView assigneeId={session.teamMemberId} />
    </>
  );
}
