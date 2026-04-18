"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientPackage } from "@/types";

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

interface PackageTabNavProps {
  packages: ClientPackage[];
  hasTickets: boolean;
  slug: string;
}

export default function PackageTabNav(_: PackageTabNavProps) {
  const [activeAnchor, setActiveAnchor] = useState("");

  const onScroll = useCallback(() => {
    const headerHeight = 100;
    let current = SEO_SUB_NAV[0].id;
    for (const item of SEO_SUB_NAV) {
      const el = document.getElementById(item.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= headerHeight + 20) {
        current = item.id;
      }
    }
    setActiveAnchor(current);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  return (
    <nav className="flex items-center gap-5 overflow-x-auto scrollbar-hide">
      {SEO_SUB_NAV.map((item) => (
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
  );
}
