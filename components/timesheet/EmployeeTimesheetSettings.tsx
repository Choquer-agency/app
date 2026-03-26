"use client";

import { useState } from "react";
import MyTimesheetHistory from "./MyTimesheetHistory";
import VacationRequestForm from "./VacationRequestForm";
import MyVacationRequests from "./MyVacationRequests";

export default function EmployeeTimesheetSettings({
  teamMemberId,
}: {
  teamMemberId: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">My Timesheet</h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        View your schedule, history, and manage vacation requests.
      </p>

      {/* Vacation Request */}
      <div className="mb-8">
        <VacationRequestForm teamMemberId={teamMemberId} onSubmit={refresh} />
      </div>

      {/* My Vacation Requests */}
      <MyVacationRequests teamMemberId={teamMemberId} refreshKey={refreshKey} />

      {/* History */}
      <div className="mt-8">
        <MyTimesheetHistory teamMemberId={teamMemberId} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
