import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import NotificationPreferences from "@/components/NotificationPreferences";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";

export default async function NotificationSettingsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session) {
    redirect("/admin/settings");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">
        Notification Preferences
      </h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Choose which notifications you receive. Changes save automatically.
      </p>
      <NotificationPermissionBanner />
      <NotificationPreferences roleLevel={session.roleLevel} />
    </div>
  );
}
