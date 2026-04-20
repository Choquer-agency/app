export interface MonthChunk {
  year: number;
  month: number;
  monthKey: string;
  rawContent: string;
  headingText: string;
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const MONTH_LOOKUP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  MONTH_NAMES.forEach((n, i) => {
    map[n] = i + 1;
    map[n.slice(0, 3)] = i + 1;
  });
  return map;
})();

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

function flattenText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(flattenText).join("");
}

function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isHeading(node: TiptapNode): boolean {
  return node.type === "heading" || node.type === "title";
}

// A short paragraph whose entire text reads like a month header is treated as
// a month heading too (Notion paste sometimes drops heading semantics).
function isPotentialMonthMarker(node: TiptapNode): boolean {
  if (isHeading(node)) return true;
  if (node.type !== "paragraph") return false;
  const text = flattenText(node).trim();
  if (!text || text.length > 60) return false;
  return parseHeadingText(text) !== null;
}

interface ParsedHeading {
  kind: "year" | "month";
  year?: number;
  month?: number;
}

function parseHeadingText(text: string): ParsedHeading | null {
  const cleaned = text
    .trim()
    .replace(/^seo\s+updates?\s+/i, "")
    .replace(/[–—\-:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  // Year only — e.g. "2025"
  const yearOnly = cleaned.match(/^(\d{4})$/);
  if (yearOnly) {
    return { kind: "year", year: parseInt(yearOnly[1], 10) };
  }

  // Month with optional year — "March", "March 2026", "March of 2026"
  const monthMatch = cleaned.match(/^([A-Za-z]+)(?:\s+(?:of\s+)?(\d{4}))?$/);
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    const month = MONTH_LOOKUP[monthName];
    if (!month) return null;
    return {
      kind: "month",
      month,
      year: monthMatch[2] ? parseInt(monthMatch[2], 10) : undefined,
    };
  }

  // Month + year reversed — "2026 March"
  const reversed = cleaned.match(/^(\d{4})\s+([A-Za-z]+)$/);
  if (reversed) {
    const monthName = reversed[2].toLowerCase();
    const month = MONTH_LOOKUP[monthName];
    if (!month) return null;
    return {
      kind: "month",
      month,
      year: parseInt(reversed[1], 10),
    };
  }

  return null;
}

export function chunkTiptapByMonth(
  doc: TiptapNode,
  defaultYear: number
): MonthChunk[] {
  if (!doc?.content?.length) return [];

  const chunks: MonthChunk[] = [];
  let currentYear = defaultYear;
  let active: {
    year: number;
    month: number;
    headingText: string;
    nodes: TiptapNode[];
  } | null = null;

  function finalize() {
    if (!active) return;
    if (active.nodes.length === 0) {
      active = null;
      return;
    }
    const tiptapDoc = { type: "doc", content: active.nodes };
    chunks.push({
      year: active.year,
      month: active.month,
      monthKey: monthKeyOf(active.year, active.month),
      rawContent: JSON.stringify(tiptapDoc),
      headingText: active.headingText,
    });
    active = null;
  }

  for (const node of doc.content) {
    if (isPotentialMonthMarker(node)) {
      const text = flattenText(node);
      const parsed = parseHeadingText(text);

      if (parsed?.kind === "year") {
        finalize();
        currentYear = parsed.year!;
        continue;
      }

      if (parsed?.kind === "month") {
        finalize();
        const year = parsed.year ?? currentYear;
        active = {
          year,
          month: parsed.month!,
          headingText: text.trim(),
          nodes: [],
        };
        continue;
      }
    }

    if (active) {
      active.nodes.push(node);
    }
  }

  finalize();

  // Dedupe by monthKey, last occurrence wins (paste order is usually newest-first).
  const dedup = new Map<string, MonthChunk>();
  for (const c of chunks) dedup.set(c.monthKey, c);
  return [...dedup.values()].sort((a, b) =>
    a.monthKey < b.monthKey ? -1 : 1
  );
}
