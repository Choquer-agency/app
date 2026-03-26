import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import AdminLeadsList from "@/components/AdminLeadsList";

export const dynamic = "force-dynamic";

export default async function CRMLeadsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || !hasPermission(session.roleLevel, "nav:leads")) {
    redirect("/admin");
  }

  return <AdminLeadsList />;
}
