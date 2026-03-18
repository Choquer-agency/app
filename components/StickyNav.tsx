"use client";

import { useState, useEffect, useCallback } from "react";

const NAV_ITEMS = [
  { label: "Goals", id: "goals-section" },
  { label: "This Month", id: "worklog-section" },
  { label: "Metrics", id: "kpi-section" },
  { label: "Upcoming", id: "upcoming-section" },
  { label: "History", id: "historical-section" },
];

export default function StickyNav() {
  const [activeId, setActiveId] = useState("goals-section");

  const onScroll = useCallback(() => {
    const headerHeight = 60;
    let current = "goals-section";

    for (const { id } of NAV_ITEMS) {
      const el = document.getElementById(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= headerHeight + 20) {
        current = id;
      }
    }

    setActiveId(current);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  return (
    <nav className="flex items-center gap-5">
      {NAV_ITEMS.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`text-xs transition whitespace-nowrap ${
            activeId === item.id
              ? "font-bold text-[#1A1A1A]"
              : "font-medium text-muted hover:text-[#1A1A1A]"
          }`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
