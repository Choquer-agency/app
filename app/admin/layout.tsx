import { cookies } from "next/headers";
import AdminLogin from "./login";
import AdminNav from "@/components/AdminNav";
import FloatingTimerBar from "@/components/FloatingTimerBar";
import NotificationBridge from "@/components/NotificationBridge";
import GlobalTicketModal from "@/components/GlobalTicketModal";
import DesktopShortcutHandler from "@/components/DesktopShortcutHandler";
import UpdatePrompt from "@/components/UpdatePrompt";
import KeyboardShortcutProvider from "@/components/KeyboardShortcutProvider";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  if (session) {
    // Fetch profile pic for avatar
    let profilePicUrl: string | undefined;
    let bypassClockIn = false;
    try {
      const convex = getConvexClient();
      const member = await convex.query(api.teamMembers.getById, { id: session.teamMemberId as any });
      profilePicUrl = (member as any)?.profilePicUrl || undefined;
      bypassClockIn = (member as any)?.bypassClockIn === true;
    } catch {}

    return (
      <div className="min-h-screen bg-white" style={{ fontSize: "76%" }}>
        <KeyboardShortcutProvider>
          <AdminNav userName={session.name} roleLevel={session.roleLevel} profilePicUrl={profilePicUrl} bypassClockIn={bypassClockIn} teamMemberId={session.teamMemberId} />
          <NotificationBridge teamMemberId={session.teamMemberId} />
          <UpdatePrompt />
          <div className="max-w-[1400px] mx-auto px-6 py-8 pb-20">{children}</div>
          <FloatingTimerBar />
          <GlobalTicketModal />
          <DesktopShortcutHandler />
        </KeyboardShortcutProvider>
      </div>
    );
  }

  return <AdminLogin />;
}
