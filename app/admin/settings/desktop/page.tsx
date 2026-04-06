import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import DesktopSettings from "@/components/DesktopSettings";

export default async function DesktopSettingsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session) {
    redirect("/admin/settings");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">
        Desktop App
      </h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Settings for the Choquer.Agency desktop app. These options are only
        available when using the desktop version.
      </p>
      <DesktopSettings />
    </div>
  );
}
