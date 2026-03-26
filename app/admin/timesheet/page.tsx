import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import TimesheetPage from "@/components/timesheet/TimesheetPage";

export const dynamic = "force-dynamic";

export default async function TimesheetRoute() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  if (!session) {
    redirect("/admin/login");
  }
  if (!hasPermission(session.roleLevel, "nav:timesheet")) {
    redirect("/admin");
  }

  // Employees clock in from the homepage — redirect them there
  const canViewAll = hasPermission(session.roleLevel, "timesheet:view_all");
  const canManage = hasPermission(session.roleLevel, "timesheet:manage");
  if (!canViewAll && !canManage) {
    redirect("/admin");
  }

  return (
    <TimesheetPage
      roleLevel={session.roleLevel}
      teamMemberId={session.teamMemberId}
      userName={session.name}
    />
  );
}
