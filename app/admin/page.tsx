import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import HomeDashboard from "@/components/HomeDashboard";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  if (!session) {
    redirect("/admin/login");
  }

  // Bookkeepers land on timesheet, not the home dashboard
  if (session.roleLevel === "bookkeeper") {
    redirect("/admin/timesheet");
  }

  return <HomeDashboard roleLevel={session.roleLevel} userName={session.name} teamMemberId={session.teamMemberId} />;
}
