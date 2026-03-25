import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import TimesheetSettings from "@/components/timesheet/TimesheetSettings";

export default async function TimesheetSettingsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || !hasPermission(session.roleLevel, "timesheet:manage")) {
    redirect("/admin/settings");
  }

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
