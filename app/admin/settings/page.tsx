import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || !hasPermission(session.roleLevel, "nav:settings")) {
    redirect("/admin");
  }
  redirect("/admin/settings/packages");
}
