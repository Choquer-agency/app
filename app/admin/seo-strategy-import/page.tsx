import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import SeoStrategyImporter from "@/components/SeoStrategyImporter";

export const dynamic = "force-dynamic";

export default async function SeoStrategyImportPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || session.roleLevel !== "owner") {
    redirect("/admin");
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">
          SEO Strategy — Notion Bulk Import
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          One-time tool. Pick a client, paste their full Notion strategy board, fire it off, move to the next.
          Months will enrich in the background within a few minutes.
        </p>
      </div>
      <SeoStrategyImporter />
    </div>
  );
}
