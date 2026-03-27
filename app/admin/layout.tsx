import { cookies } from "next/headers";
import AdminLogin from "./login";
import AdminNav from "@/components/AdminNav";
import FloatingTimerBar from "@/components/FloatingTimerBar";
import GlobalTicketModal from "@/components/GlobalTicketModal";
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
    try {
      const convex = getConvexClient();
      const member = await convex.query(api.teamMembers.getById, { id: session.teamMemberId as any });
      profilePicUrl = (member as any)?.profilePicUrl || undefined;
    } catch {}

    return (
      <div className="min-h-screen bg-white" style={{ fontSize: "80%" }}>
        <KeyboardShortcutProvider>
          <AdminNav userName={session.name} roleLevel={session.roleLevel} profilePicUrl={profilePicUrl} />
          <div className="max-w-[1400px] mx-auto px-10 py-8 pb-20">{children}</div>
          <FloatingTimerBar />
          <GlobalTicketModal />
        </KeyboardShortcutProvider>
      </div>
    );
  }

  return <AdminLogin />;
}
