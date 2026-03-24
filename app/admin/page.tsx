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

  return <HomeDashboard roleLevel={session.roleLevel} userName={session.name} teamMemberId={session.teamMemberId} />;
}
