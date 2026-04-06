import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import PaymentsView from "@/components/PaymentsView";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || !hasPermission(session.roleLevel, "nav:payments")) {
    redirect("/admin");
  }

  return <PaymentsView />;
}
