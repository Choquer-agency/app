import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/admin-auth";
import SettingsSubNav from "@/components/SettingsSubNav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);

  return (
    <>
      {/* Break out of parent container to render full-width sub-nav */}
      <div className="-mx-10 -mt-8 mb-8">
        <SettingsSubNav roleLevel={session?.roleLevel} />
      </div>
      {children}
    </>
  );
}
