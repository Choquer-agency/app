"use client";

import { useSearchParams } from "next/navigation";
import { ClientConfig, ClientPackage } from "@/types";
import ClientTicketsView from "./ClientTicketsView";
import PackageStubView from "./PackageStubView";

interface ClientPortalShellProps {
  client: ClientConfig;
  packages: ClientPackage[];
  defaultTab: string;
  children: React.ReactNode; // SSR'd SEO content
}

export default function ClientPortalShell({ client, packages, defaultTab, children }: ClientPortalShellProps) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || defaultTab;

  const isSeoTab = activeTab === "seo" || activeTab === defaultTab;
  const isTasksTab = activeTab === "tasks";

  // Check if this tab corresponds to a known package category
  const knownCategories = ["seo", "retainer", "google_ads", "social_media_ads", "blog", "website", "other"];
  const isStubTab = !isSeoTab && !isTasksTab && knownCategories.includes(activeTab);

  // Get package info for stub display
  const stubPackage = packages.find((p) => p.packageCategory === activeTab && p.active);

  return (
    <>
      {/* SEO content — always in DOM for SSR, hidden via CSS when not active */}
      <div style={{ display: isSeoTab ? "block" : "none" }}>
        {children}
      </div>

      {/* Tasks tab */}
      {isTasksTab && (
        <div className="max-w-3xl mx-auto px-6 py-6">
          <ClientTicketsView slug={client.slug} clientName={client.name} />
        </div>
      )}

      {/* Stub tab for other packages */}
      {isStubTab && (
        <div className="max-w-3xl mx-auto px-6 py-6">
          <PackageStubView
            packageName={stubPackage?.packageName || activeTab}
            packageCategory={activeTab}
          />
        </div>
      )}
    </>
  );
}
