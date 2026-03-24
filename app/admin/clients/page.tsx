import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import AdminClientList from "@/components/AdminClientList";
import GoalIssuesPanel from "@/components/GoalIssuesPanel";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || !hasPermission(session.roleLevel, "nav:clients")) {
    redirect("/admin");
  }

  return (
    <>
      <GoalIssuesPanel />
      <AdminClientList />
    </>
  );
}
