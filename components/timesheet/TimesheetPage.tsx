"use client";

import { useState } from "react";
import { hasPermission, type RoleLevel } from "@/lib/permissions";
import ClockInOutCard from "./ClockInOutCard";
import MyTimesheetHistory from "./MyTimesheetHistory";
import VacationRequestForm from "./VacationRequestForm";
import MyVacationRequests from "./MyVacationRequests";
import AdminTimesheetDashboard from "./AdminTimesheetDashboard";

export default function TimesheetPage({
  roleLevel,
  teamMemberId,
  userName,
}: {
  roleLevel: RoleLevel;
  teamMemberId: string;
  userName: string;
}) {
  const canManage = hasPermission(roleLevel, "timesheet:manage");
  const canViewAll = hasPermission(roleLevel, "timesheet:view_all");

  // Admin/bookkeeper users go straight to dashboard; employees go to clock view
  const isAdminUser = canViewAll || canManage;

  const [employeeView, setEmployeeView] = useState<"clock" | "history">("clock");
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  // ===================== ADMIN / BOOKKEEPER FLOW =====================
  if (isAdminUser) {
    return (
      <div className="mt-4 md:mt-8 pb-20">
        <AdminTimesheetDashboard teamMemberId={teamMemberId} />
      </div>
    );
  }

  // ===================== EMPLOYEE FLOW =====================
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName?.split(" ")[0] || "";

  if (employeeView === "history") {
    return (
      <div className="max-w-4xl mx-auto mt-4 md:mt-8 px-4 md:px-6 pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-6 md:mb-8">
          <button
            onClick={() => setEmployeeView("clock")}
            className="text-sm text-[#6B6B6B] hover:text-[#263926] self-start"
          >
            &larr; Back
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-[#263926]">
            My Schedule & History
          </h1>
        </div>
        <MyTimesheetHistory teamMemberId={teamMemberId} refreshKey={refreshKey} />
      </div>
    );
  }

  // Default: Employee Clock View
  return (
    <div className="max-w-md mx-auto mt-6 md:mt-12 px-4 md:px-6 pb-20">
      {/* Greeting */}
      <div className="text-center mb-8 md:mb-10">
        <h2 className="text-2xl md:text-3xl font-bold text-[#263926] mb-2">
          {greeting}, {firstName}
        </h2>
        <p className="text-sm md:text-base text-[#6B6B6B] font-medium">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Clock In/Out Card */}
      <ClockInOutCard teamMemberId={teamMemberId} onStatusChange={refresh} />

      {/* Employee Navigation */}
      <div className="mt-6 md:mt-8 flex flex-col gap-3 md:gap-4">
        <VacationRequestForm teamMemberId={teamMemberId} onSubmit={refresh} />

        <button
          onClick={() => setEmployeeView("history")}
          className="w-full py-3 md:py-4 text-[#263926] bg-[#F6F5F1] hover:bg-[#E5E3DA] border border-[#F6F5F1] rounded-2xl font-medium text-sm min-h-[48px] transition-colors"
        >
          View Schedule & History
        </button>
      </div>

      {/* My Vacation Requests */}
      <MyVacationRequests teamMemberId={teamMemberId} refreshKey={refreshKey} />
    </div>
  );
}
