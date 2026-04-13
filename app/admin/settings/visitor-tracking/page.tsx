import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import SettingsSubNav from "@/components/SettingsSubNav";
import VisitorTrackingSettings from "@/components/VisitorTrackingSettings";

export const dynamic = "force-dynamic";

export default async function VisitorTrackingPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session) redirect("/admin");

  if (!hasPermission(session.roleLevel, "traffic:view")) {
    redirect("/admin/settings");
  }

  return (
    <>
      <SettingsSubNav roleLevel={session.roleLevel} />
      <div className="max-w-3xl mx-auto py-8 px-6">
        <VisitorTrackingSettings />
      </div>
    </>
  );
}
