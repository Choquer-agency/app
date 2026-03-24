import { cookies } from "next/headers";
import AdminLogin from "./login";
import AdminNav from "@/components/AdminNav";
import FloatingTimerBar from "@/components/FloatingTimerBar";
import GlobalTicketModal from "@/components/GlobalTicketModal";
import KeyboardShortcutProvider from "@/components/KeyboardShortcutProvider";
import { getSessionFromCookies } from "@/lib/admin-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  if (session) {
    return (
      <div className="min-h-screen bg-white" style={{ fontSize: "80%" }}>
        <KeyboardShortcutProvider>
          <AdminNav userName={session.name} roleLevel={session.roleLevel} />
          <div className="max-w-[1400px] mx-auto px-10 py-8 pb-20">{children}</div>
          <FloatingTimerBar />
          <GlobalTicketModal />
        </KeyboardShortcutProvider>
      </div>
    );
  }

  return <AdminLogin />;
}
