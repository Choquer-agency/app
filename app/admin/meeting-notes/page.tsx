import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import MeetingNotesIngestion from "@/components/MeetingNotesIngestion";

export const dynamic = "force-dynamic";

export default async function MeetingNotesPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  if (!session || !hasPermission(session.roleLevel, "nav:reports")) {
    redirect("/admin");
  }

  return (
    <MeetingNotesIngestion
      roleLevel={session.roleLevel}
      teamMemberId={session.teamMemberId}
    />
  );
}
