import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import OrgConnections from "@/components/connections/OrgConnections";
import AllClientPlatforms from "@/components/connections/AllClientPlatforms";

export default async function ConnectionsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session) redirect("/admin");

  if (!hasPermission(session.roleLevel, "connections:view")) {
    redirect("/admin/settings");
  }

  const canManage = hasPermission(session.roleLevel, "connections:manage");

  return (
    <>
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-[var(--foreground)]">Connections</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Manage API connections for internal tools and client platforms.
          </p>
        </div>

        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Internal Tools</h2>
          <p className="text-[10px] text-[var(--muted)] mb-3">Organization-wide connections used across all clients.</p>
          <OrgConnections canManage={canManage} />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Client Platforms</h2>
          <p className="text-[10px] text-[var(--muted)] mb-3">These are connected per-client on their CRM profile. Overview of all client connections below.</p>
          <AllClientPlatforms canManage={canManage} />
        </div>
      </div>
    </>
  );
}
