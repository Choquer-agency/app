import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/admin-auth";
import MetaAdsSettings from "@/components/MetaAdsSettings";

export default async function MetaAdsSettingsPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookies(cookieStore);
  if (!session) {
    redirect("/admin/settings");
  }

  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";
  const webhookUrl = siteUrl ? `${siteUrl}/webhooks/meta/lead-ads` : "";

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Meta Ads</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Connect Meta Ads for lead-quality optimization. Leads from Facebook/Instagram flow
        into the CRM, and status updates are automatically reported back to Meta's
        Conversions API so campaigns optimize for qualified leads — not just form fills.
      </p>
      <MetaAdsSettings webhookUrl={webhookUrl} />
    </div>
  );
}
