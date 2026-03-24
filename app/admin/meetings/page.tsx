import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/admin-auth";
import MeetingsPageClient from "@/components/MeetingsPageClient";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  return (
    <MeetingsPageClient
      roleLevel={session?.roleLevel || "employee"}
      teamMemberId={session?.teamMemberId}
    />
  );
}
