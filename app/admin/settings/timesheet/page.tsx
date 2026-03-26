import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import TimesheetSettings from "@/components/timesheet/TimesheetSettings";
import EmployeeTimesheetSettings from "@/components/timesheet/EmployeeTimesheetSettings";

export default async function TimesheetSettingsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session) {
    redirect("/admin/settings");
  }

  const canManage = hasPermission(session.roleLevel, "timesheet:manage");

  // Admins/bookkeepers see the settings panel
  if (canManage) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Timesheet Settings</h1>
        <p className="text-sm text-[var(--muted)] mb-8">
          Configure timesheet rules, thresholds, and bookkeeper contact.
        </p>
        <TimesheetSettings />
      </div>
    );
  }

  // Employees see their history, vacation requests, and can request vacation
  return (
    <EmployeeTimesheetSettings teamMemberId={session.teamMemberId} />
  );
}
