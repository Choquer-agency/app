import { WorkLogEntry } from "@/types";
import { AnalyticsEnrichment } from "@/types/enrichment";
import { friendlyDate } from "@/lib/date-format";

interface WorkLogProps {
  entries: WorkLogEntry[];
  summary?: string;
  monthLabel: string;
  isComplete: boolean;
  goalSummary?: string;
  lastUpdated?: string;
  analyticsEnrichments?: AnalyticsEnrichment[];
  taskCompletion?: { completed: number; total: number };
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

function formatLastUpdated(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays < 7) return `Updated ${diffDays} days ago`;
  return `Updated ${friendlyDate(dateStr)}`;
}

function fmtNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function cleanLinkLabel(url: string): string {
  try {
    const u = new URL(url);
    // Google Sheets
    if (u.hostname.includes("docs.google.com") && u.pathname.includes("/spreadsheets/")) return "View Spreadsheet";
    // Google Docs
    if (u.hostname.includes("docs.google.com") && u.pathname.includes("/document/")) return "View Document";
    // Google Drive
    if (u.hostname.includes("drive.google.com")) return "View File";
    // Google Slides
    if (u.hostname.includes("docs.google.com") && u.pathname.includes("/presentation/")) return "View Slides";
    // Generic — use last meaningful path segment
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1]
        .replace(/[-_]/g, " ")
        .replace(/\.\w+$/, "");
      if (last && last.length > 2 && last.length < 60) return last;
    }
    return "View Link";
  } catch {
    return "View Link";
  }
}

function findEnrichment(entry: WorkLogEntry, enrichments: AnalyticsEnrichment[]): AnalyticsEnrichment | undefined {
  // Match by checking if any deliverable link or task text references a tracked page
  for (const e of enrichments) {
    if (e.entityType !== "page") continue;
    const entity = e.entity.toLowerCase();
    // Check deliverable links
    for (const link of entry.deliverableLinks) {
      if (link.toLowerCase().includes(entity)) return e;
    }
    // Check task text for page path mention
    if (entry.task.toLowerCase().includes(entity)) return e;
  }
  return undefined;
}

export default function WorkLog({ entries, summary, monthLabel, isComplete, goalSummary, lastUpdated, analyticsEnrichments = [], taskCompletion }: WorkLogProps) {
  if (entries.length === 0 && !summary && !goalSummary) return null;

  return (
    <section id="worklog-section" className="mb-6 pt-2" data-track="worklog">
      {/* Section header — always visible, not toggleable */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold">{monthLabel}</h2>
        {taskCompletion && taskCompletion.total > 0 ? (
          taskCompletion.completed === taskCompletion.total ? (
            <span className="text-[10px] bg-[#BDFFE8] text-[#0d5a3f] px-2 py-0.5 rounded-full font-medium">
              Complete
            </span>
          ) : (
            <>
              <span className="text-[10px] bg-[#FFF09E] text-[#6b5f00] px-2 py-0.5 rounded-full font-medium">
                {taskCompletion.completed}/{taskCompletion.total} completed
              </span>
              <div className="w-16 h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0d7a55] rounded-full transition-all"
                  style={{ width: `${Math.round((taskCompletion.completed / taskCompletion.total) * 100)}%` }}
                />
              </div>
            </>
          )
        ) : isComplete ? (
          <span className="text-[10px] bg-[#BDFFE8] text-[#0d5a3f] px-2 py-0.5 rounded-full font-medium">
            Complete
          </span>
        ) : (
          <span className="text-[10px] bg-[#FFF09E] text-[#6b5f00] px-2 py-0.5 rounded-full font-medium">
            In Progress
          </span>
        )}
        {lastUpdated && (
          <span className="text-[10px] text-muted ml-auto">{formatLastUpdated(lastUpdated)}</span>
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
            {entry.completed ?? isComplete ? (
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
              {entry.impact && (
                <p className="text-xs text-[#5B52B6] mt-0.5 italic">{entry.impact}</p>
              )}
              {/* Subtasks: structured array or legacy string */}
              {entry.subtasks && (
                Array.isArray(entry.subtasks) && entry.subtasks.length > 0 ? (
                  <div className="mt-1.5 ml-1 space-y-1">
                    {entry.subtasks.map((st, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {st.completed ? (
                          <svg className="w-3 h-3 text-[#0d7a55] flex-shrink-0" viewBox="0 0 16 16" fill="none">
                            <path d="M13.5 4.5L6.5 11.5L2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <div className="w-3 h-3 rounded-full border-[1.5px] border-[#D1D5DB] flex-shrink-0" />
                        )}
                        <span className={`text-xs ${st.completed ? "text-[#888]" : "text-[#1A1A1A]"}`}>{st.text}</span>
                        {st.link && (
                          <a href={st.link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#FF9500] hover:underline" data-track="link">
                            {st.linkLabel && !st.linkLabel.startsWith("http") ? st.linkLabel : cleanLinkLabel(st.link)}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : typeof entry.subtasks === "string" && entry.subtasks ? (
                  <p className="text-xs text-muted mt-0.5">{entry.subtasks}</p>
                ) : null
              )}
              {/* Only show top-level deliverableLinks if subtasks don't already have links */}
              {entry.deliverableLinks.length > 0 && !(Array.isArray(entry.subtasks) && entry.subtasks.some(s => s.link)) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  {entry.deliverableLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#FF9500] hover:underline"
                      data-track="link"
                    >
                      {cleanLinkLabel(link)}
                    </a>
                  ))}
                </div>
              )}
              {(() => {
                const enrichment = analyticsEnrichments.length > 0 ? findEnrichment(entry, analyticsEnrichments) : undefined;
                if (!enrichment || (!enrichment.data.clicks && !enrichment.data.impressions)) return null;
                return (
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] bg-[#FAFCFF] border border-[#E5E5E5] rounded-lg px-2.5 py-1.5">
                    <span className="text-muted font-medium uppercase tracking-wide">Performance</span>
                    {enrichment.data.clicks !== undefined && (
                      <span className="text-[#1A1A1A]">
                        <span className="font-semibold">{fmtNumber(enrichment.data.clicks)}</span> clicks
                      </span>
                    )}
                    {enrichment.data.impressions !== undefined && (
                      <span className="text-[#1A1A1A]">
                        <span className="font-semibold">{fmtNumber(enrichment.data.impressions)}</span> impressions
                      </span>
                    )}
                    {enrichment.data.changePercent !== undefined && enrichment.data.changePercent !== 0 && (
                      <span className={`font-medium ${enrichment.data.changePercent >= 0 ? "text-[#0d7a55]" : "text-[#b91c1c]"}`}>
                        {enrichment.data.changePercent >= 0 ? "+" : ""}{enrichment.data.changePercent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
