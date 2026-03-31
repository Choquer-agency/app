export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
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

  // Check if member bypasses clock-in
  let bypassClockIn = false;
  try {
    const convex = getConvexClient();
    const member = await convex.query(api.teamMembers.getById, { id: session.teamMemberId as any });
    bypassClockIn = !!(member as any)?.bypassClockIn;
  } catch {}

  return <HomeDashboard roleLevel={session.roleLevel} userName={session.name} teamMemberId={session.teamMemberId} bypassClockIn={bypassClockIn} />;
}
