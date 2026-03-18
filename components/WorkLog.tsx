import { WorkLogEntry } from "@/types";

interface WorkLogProps {
  entries: WorkLogEntry[];
  summary?: string;
  monthLabel: string;
  isComplete: boolean;
  goalSummary?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Content: "bg-[#B1D0FF] text-[#1a4a7a]",
  "On-Page SEO": "bg-[#BDFFE8] text-[#0d5a3f]",
  Technical: "bg-[#A69FFF] text-[#2d2878]",
  "Link Building": "bg-[#FFA69E] text-[#7a1a14]",
  Analytics: "bg-[#FFF09E] text-[#6b5f00]",
  Strategy: "bg-[#FBBDFF] text-[#6b1470]",
};

function getCat(cat: string) {
  return CATEGORY_COLORS[cat] || "bg-[#F0F0F0] text-[#6b7280]";
}

export default function WorkLog({ entries, summary, monthLabel, isComplete, goalSummary }: WorkLogProps) {
  if (entries.length === 0 && !summary && !goalSummary) return null;

  return (
    <section id="worklog-section" className="mb-6 pt-2" data-track="worklog">
      {/* Section header — always visible, not toggleable */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold">{monthLabel}</h2>
        {isComplete ? (
          <span className="text-[10px] bg-[#BDFFE8] text-[#0d5a3f] px-2 py-0.5 rounded-full font-medium">
            Complete
          </span>
        ) : (
          <span className="text-[10px] bg-[#FFF09E] text-[#6b5f00] px-2 py-0.5 rounded-full font-medium">
            In Progress
          </span>
        )}
      </div>

      {/* Strategy or summary */}
      {isComplete && summary ? (
        <div className="mb-4 bg-[#EEFFF7] rounded-xl p-4">
          <p className="text-xs font-medium text-[#0d5a3f] uppercase tracking-wide mb-1">Month Summary</p>
          <p className="text-sm leading-relaxed text-[#1A1A1A]">{summary}</p>
        </div>
      ) : goalSummary ? (
        <div className="mb-4 bg-[#FFF3E0] border border-[#FFD69E] rounded-xl p-4">
          <p className="text-xs font-medium text-[#8B5E00] uppercase tracking-wide mb-1">Strategy This Month</p>
          <p className="text-sm leading-relaxed text-[#1A1A1A]">{goalSummary}</p>
        </div>
      ) : null}

      {/* Task list */}
      <div className="border border-[#E5E5E5] rounded-xl overflow-hidden">
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className={`flex items-start gap-3 px-4 py-3 ${
              i < entries.length - 1 ? "border-b border-[#F0F0F0]" : ""
            }`}
          >
            {isComplete ? (
              <svg className="w-4 h-4 mt-0.5 text-[#0d7a55] flex-shrink-0" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 4.5L6.5 11.5L2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <div className="w-4 h-4 mt-0.5 rounded-full border-2 border-[#D1D5DB] flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-[#1A1A1A]">{entry.task}</span>
                {entry.category.map((cat) => (
                  <span
                    key={cat}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getCat(cat)}`}
                  >
                    {cat}
                  </span>
                ))}
              </div>
              {entry.subtasks && (
                <p className="text-xs text-muted mt-0.5">{entry.subtasks}</p>
              )}
              {entry.deliverableLinks.length > 0 && (
                <div className="flex gap-2 mt-1">
                  {entry.deliverableLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#FF9500] hover:underline"
                      data-track="link"
                    >
                      View deliverable
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
