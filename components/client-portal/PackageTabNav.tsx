"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ClientPackage, PackageCategory } from "@/types";

const CATEGORY_TAB_CONFIG: Record<string, { label: string; order: number }> = {
  seo: { label: "SEO Report", order: 1 },
  retainer: { label: "Retainer", order: 2 },
  google_ads: { label: "Google Ads", order: 3 },
  social_media_ads: { label: "Social Ads", order: 4 },
  blog: { label: "Blog", order: 5 },
  website: { label: "Website", order: 6 },
  other: { label: "Services", order: 7 },
};

interface SubNavItem {
  label: string;
  id: string;
}

const SEO_SUB_NAV: SubNavItem[] = [
  { label: "Goals", id: "goals-section" },
  { label: "This Month", id: "worklog-section" },
  { label: "Metrics", id: "kpi-section" },
  { label: "Upcoming", id: "upcoming-section" },
  { label: "History", id: "historical-section" },
];

const TASKS_SUB_NAV: SubNavItem[] = [
  { label: "Open", id: "tasks-open" },
  { label: "In Review", id: "tasks-review" },
  { label: "Completed", id: "tasks-completed" },
];

interface PackageTabNavProps {
  packages: ClientPackage[];
  hasTickets: boolean;
  slug: string;
}

export default function PackageTabNav({ packages, hasTickets, slug }: PackageTabNavProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = searchParams.get("tab") || getDefaultTab(packages);
  const [activeAnchor, setActiveAnchor] = useState("");

  // Build tabs from packages (deduplicated by category)
  const tabs = buildTabs(packages, hasTickets);

  // Get sub-nav for active tab
  const subNav = getSubNav(activeTab);

  function handleTabClick(tabId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (tabId === getDefaultTab(packages)) {
      params.delete("tab");
    } else {
      params.set("tab", tabId);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  // Scroll-tracking for sub-nav anchor links
  const onScroll = useCallback(() => {
    if (subNav.length === 0) return;
    const headerHeight = 100;
    let current = subNav[0].id;
    for (const item of subNav) {
      const el = document.getElementById(item.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= headerHeight + 20) {
        current = item.id;
      }
    }
    setActiveAnchor(current);
  }, [subNav]);

  useEffect(() => {
    if (subNav.length === 0) return;
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll, subNav]);

  return (
    <div>
      {/* Package Tabs */}
      <nav className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`text-xs whitespace-nowrap transition px-2 py-1 rounded-md ${
              activeTab === tab.id
                ? "font-bold text-[#1A1A1A] bg-gray-100"
                : "font-medium text-[#6b7280] hover:text-[#1A1A1A]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Sub Navigation */}
      {subNav.length > 0 && (
        <div className="border-t border-[#F0F0F0] mt-1 pt-1.5">
          <nav className="flex items-center gap-5 overflow-x-auto scrollbar-hide">
            {subNav.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`text-[11px] transition whitespace-nowrap ${
                  activeAnchor === item.id
                    ? "font-bold text-[#1A1A1A]"
                    : "font-medium text-[#9ca3af] hover:text-[#1A1A1A]"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

function getDefaultTab(packages: ClientPackage[]): string {
  const categories = [...new Set(packages.filter((p) => p.active).map((p) => p.packageCategory || "other"))];
  const sorted = categories.sort((a, b) => {
    const orderA = CATEGORY_TAB_CONFIG[a || "other"]?.order ?? 99;
    const orderB = CATEGORY_TAB_CONFIG[b || "other"]?.order ?? 99;
    return orderA - orderB;
  });
  return sorted[0] || "seo";
}

function buildTabs(packages: ClientPackage[], hasTickets: boolean) {
  const categories = [...new Set(packages.filter((p) => p.active).map((p) => p.packageCategory || "other"))];
  const tabs = categories
    .map((cat) => ({
      id: cat as string,
      label: CATEGORY_TAB_CONFIG[cat as string]?.label || cat,
      order: CATEGORY_TAB_CONFIG[cat as string]?.order ?? 99,
    }))
    .sort((a, b) => a.order - b.order);

  if (hasTickets) {
    tabs.push({ id: "tasks", label: "Tasks", order: 100 });
  }

  return tabs;
}

function getSubNav(activeTab: string): SubNavItem[] {
  if (activeTab === "seo") return SEO_SUB_NAV;
  if (activeTab === "tasks") return TASKS_SUB_NAV;
  return [];
}
