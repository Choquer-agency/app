import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import SeoStrategyImporter from "@/components/SeoStrategyImporter";

export const dynamic = "force-dynamic";

export default async function SeoStrategyImportPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session || !hasPermission(session.roleLevel, "seo_import:use")) {
    redirect("/admin");
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Notion Bulk Import
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          One-time migration tool. Pick a client, paste their entire Notion strategy
          board, and the import runs Claude enrichment inline so the dashboard is live
          the moment it finishes.
        </p>
      </div>
      <SeoStrategyImporter />
    </div>
  );
}
