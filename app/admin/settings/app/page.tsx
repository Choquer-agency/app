import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import AppSettings from "@/components/AppSettings";

export default async function AppSettingsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session) {
    redirect("/admin/settings");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">
        App
      </h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Version info and updates for the Choquer.Agency desktop app.
      </p>
      <AppSettings />
    </div>
  );
}
