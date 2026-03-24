import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/admin-auth";
import TeamList from "@/components/TeamList";
import type { RoleLevel } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  return <TeamList roleLevel={session?.roleLevel as RoleLevel} currentMemberId={session?.teamMemberId} />;
}
