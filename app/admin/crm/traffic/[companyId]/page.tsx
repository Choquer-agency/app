import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import CompanyTrafficDetail from "@/components/CompanyTrafficDetail";

export const dynamic = "force-dynamic";

export default async function CompanyTrafficPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || !hasPermission(session.roleLevel, "nav:traffic")) {
    redirect("/admin");
  }

  const { companyId } = await params;
  return <CompanyTrafficDetail companyId={companyId} />;
}
