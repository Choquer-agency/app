import { cookies } from "next/headers";
import AdminLogin from "./login";
import AdminSidebar from "@/components/AdminSidebar";
import FloatingTimerBar from "@/components/FloatingTimerBar";
import NotificationBridge from "@/components/NotificationBridge";
import NotificationBell from "@/components/NotificationBell";
import GlobalTicketModal from "@/components/GlobalTicketModal";
import DesktopShortcutHandler from "@/components/DesktopShortcutHandler";
import UpdatePrompt from "@/components/UpdatePrompt";
import KeyboardShortcutProvider from "@/components/KeyboardShortcutProvider";
import ReadOnlyToast from "@/components/ReadOnlyToast";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { hasMinRole } from "@/lib/permissions";
import { api } from "@/convex/_generated/api";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  if (session) {
    let profilePicUrl: string | undefined;
    let bypassClockIn = false;
    try {
      const convex = getConvexClient();
      const member = await convex.query(api.teamMembers.getById, { id: session.teamMemberId as any });
      profilePicUrl = (member as any)?.profilePicUrl || undefined;
      bypassClockIn = (member as any)?.bypassClockIn === true;
    } catch {}

    return (
      <div
        className="flex h-screen overflow-hidden"
        style={{ fontSize: "76%", background: "#FAF9F5" }}
      >
        <KeyboardShortcutProvider>
          <AdminSidebar
            userName={session.name}
            roleLevel={session.roleLevel}
            profilePicUrl={profilePicUrl}
            bypassClockIn={bypassClockIn}
            teamMemberId={session.teamMemberId}
          />
          <NotificationBridge teamMemberId={session.teamMemberId} />
          <UpdatePrompt />
          <main className="flex-1 min-w-0 overflow-y-auto">
            <div style={{ height: 22 }} />
            <div className="px-6 pt-8 pb-8">{children}</div>
          </main>
          {/* Pinned top-right notification bell with tan circle */}
          <div className="fixed top-2.5 right-4 z-40">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border)] shadow-sm"
              style={{ background: "#FAF9F5" }}
            >
              <NotificationBell canDelete={hasMinRole(session.roleLevel, "owner")} />
            </div>
          </div>
          <FloatingTimerBar />
          <GlobalTicketModal />
          <DesktopShortcutHandler />
          <ReadOnlyToast />
        </KeyboardShortcutProvider>
      </div>
    );
  }

  return <AdminLogin />;
}
