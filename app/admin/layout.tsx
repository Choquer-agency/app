import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminLogin from "./login";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const COOKIE_NAME = "insightpulse_admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(COOKIE_NAME);

  if (authCookie?.value === ADMIN_PASSWORD) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-lg font-bold">InsightPulse Admin</h1>
              <nav className="flex items-center gap-4">
                <a
                  href="/admin/clients"
                  className="text-sm text-muted hover:text-foreground transition"
                >
                  Clients
                </a>
                <a
                  href="/admin/activity"
                  className="text-sm text-muted hover:text-foreground transition"
                >
                  Activity
                </a>
              </nav>
            </div>
            <form action="/api/admin/logout" method="POST">
              <button
                type="submit"
                className="text-sm text-muted hover:text-foreground"
              >
                Logout
              </button>
            </form>
          </div>
        </nav>
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </div>
    );
  }

  return <AdminLogin />;
}
