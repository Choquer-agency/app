import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import TrafficDashboard from "@/components/TrafficDashboard";

export const dynamic = "force-dynamic";

export default async function TrafficPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || !hasPermission(session.roleLevel, "nav:traffic")) {
    redirect("/admin");
  }

  return <TrafficDashboard />;
}
