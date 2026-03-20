import { cookies } from "next/headers";
import AdminLogin from "./login";
import AdminNav from "@/components/AdminNav";
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
        <AdminNav userName={session.name} roleLevel={session.roleLevel} />
        <div className="max-w-[1400px] mx-auto px-10 py-8">{children}</div>
      </div>
    );
  }

  return <AdminLogin />;
}
