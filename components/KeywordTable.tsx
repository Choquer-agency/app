"use client";

import { useState } from "react";
import { KeywordRanking } from "@/types";

interface KeywordTableProps {
  keywords: KeywordRanking[];
}

export default function KeywordTable({ keywords }: KeywordTableProps) {
  const [showAll, setShowAll] = useState(false);

  const sorted = [...keywords].sort((a, b) => a.currentPosition - b.currentPosition);
  const displayed = showAll ? sorted : sorted.slice(0, 5);

  return (
    <section id="keywords-section" className="mb-8" data-track="keywords">
      <h2 className="text-base font-semibold mb-3">Keyword Rankings</h2>
      <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-[#FAFAFA]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E5E5] bg-white text-xs text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Keyword</th>
              <th className="px-3 py-2.5 text-left font-medium w-16">Pos.</th>
              <th className="px-3 py-2.5 text-left font-medium w-16">Change</th>
              <th className="px-3 py-2.5 text-left font-medium w-16">Vol.</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((kw, i) => (
              <tr
                key={kw.id}
                className={`${
                  i < displayed.length - 1 || keywords.length > 5 ? "border-b border-[#F0F0F0]" : ""
                } bg-white group/row hover:bg-[#FFFAF5] transition-colors cursor-default`}
              >
                <td className="px-4 py-2 text-sm text-[#1A1A1A] group-hover/row:text-[#FF9500] transition-colors">{kw.keyword}</td>
                <td className="px-3 py-2 text-sm font-medium">{kw.currentPosition}</td>
                <td className="px-3 py-2">
                  {kw.change > 0 ? (
                    <span className="text-xs font-semibold text-[#0d7a55]">+{kw.change}</span>
                  ) : kw.change < 0 ? (
                    <span className="text-xs font-semibold text-[#b91c1c]">{kw.change}</span>
                  ) : (
                    <span className="text-xs text-muted">--</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted">{kw.searchVolume.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {keywords.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2.5 text-xs text-muted hover:text-[#FF9500] transition bg-white border-t border-[#E5E5E5] font-medium"
            data-track="accordion"
          >
            {showAll ? "Show less" : `Show all ${keywords.length} keywords`}
          </button>
        )}
      </div>
    </section>
  );
}
