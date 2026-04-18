import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getClientById } from "@/lib/clients";
import { markdownToTiptap } from "@/lib/markdown-to-tiptap";
import {
  seedMonth,
  classifyStatus,
  monthKeyOf,
  EMPTY_TIPTAP_DOC,
} from "@/lib/seo-strategy-months";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_LOOKUP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  MONTH_NAMES.forEach((n, i) => {
    map[n.toLowerCase()] = i + 1;
    map[n.slice(0, 3).toLowerCase()] = i + 1;
  });
  return map;
})();

interface MonthChunk {
  year: number;
  month: number;
  monthKey: string;
  markdown: string;
}

const HEADING_REGEX =
  /^#{1,4}\s+(?:SEO\s+Updates?\s+)?([A-Za-z]+)(?:\s+(\d{4}))?\s*$/im;

function parseHeading(line: string): { name: string; year?: number } | null {
  const m = line.match(/^#{1,4}\s+(?:SEO\s+Updates?\s+)?([A-Za-z]+)(?:\s+(\d{4}))?\s*$/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!(name in MONTH_LOOKUP)) return null;
  return { name, year: m[2] ? parseInt(m[2], 10) : undefined };
}

function chunkByMonth(markdown: string): MonthChunk[] {
  const lines = markdown.split("\n");
  const chunks: MonthChunk[] = [];
  const today = new Date();
  let currentYear = today.getFullYear();
  let activeChunk: { year: number; month: number; lines: string[] } | null = null;
  let pendingYear: number | null = null;

  for (const line of lines) {
    const yearOnly = line.match(/^#{1,4}\s+(\d{4})\s*$/);
    if (yearOnly) {
      pendingYear = parseInt(yearOnly[1], 10);
      currentYear = pendingYear;
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      if (activeChunk) {
        const monthKey = monthKeyOf(activeChunk.year, activeChunk.month);
        chunks.push({
          year: activeChunk.year,
          month: activeChunk.month,
          monthKey,
          markdown: activeChunk.lines.join("\n").trim(),
        });
      }
      const month = MONTH_LOOKUP[heading.name];
      const year = heading.year ?? pendingYear ?? currentYear;
      activeChunk = { year, month, lines: [] };
      continue;
    }

    if (activeChunk) activeChunk.lines.push(line);
  }

  if (activeChunk) {
    const monthKey = monthKeyOf(activeChunk.year, activeChunk.month);
    chunks.push({
      year: activeChunk.year,
      month: activeChunk.month,
      monthKey,
      markdown: activeChunk.lines.join("\n").trim(),
    });
  }

  // De-dupe by monthKey, last wins
  const dedup = new Map<string, MonthChunk>();
  for (const c of chunks) dedup.set(c.monthKey, c);
  return [...dedup.values()].sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1));
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.roleLevel, "clients:edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { clientId, rawNotionMarkdown } = body;

    if (!clientId || typeof rawNotionMarkdown !== "string") {
      return NextResponse.json(
        { error: "clientId and rawNotionMarkdown are required" },
        { status: 400 }
      );
    }

    const client = await getClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const chunks = chunkByMonth(rawNotionMarkdown);

    if (chunks.length === 0) {
      // Fallback: dump entire content into current month, queue review
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      chunks.push({
        year,
        month,
        monthKey: monthKeyOf(year, month),
        markdown: rawNotionMarkdown,
      });
    }

    const created: string[] = [];
    for (const chunk of chunks) {
      const tiptapJson = chunk.markdown ? markdownToTiptap(chunk.markdown) : EMPTY_TIPTAP_DOC;
      const status = classifyStatus(chunk.year, chunk.month);
      const id = await seedMonth({
        clientId,
        clientSlug: client.slug,
        monthKey: chunk.monthKey,
        rawContent: tiptapJson,
        status,
        enrichmentState: "queued",
      });
      created.push(id);
    }

    return NextResponse.json({
      clientId,
      clientSlug: client.slug,
      monthsImported: chunks.length,
      ids: created,
    });
  } catch (error) {
    console.error("SEO strategy import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
