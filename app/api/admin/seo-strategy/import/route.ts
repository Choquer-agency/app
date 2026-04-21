import { NextRequest, NextResponse, after } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getClientById } from "@/lib/clients";
import { chunkTiptapByMonth } from "@/lib/seo-import-chunker";
import { markdownToTiptap } from "@/lib/markdown-to-tiptap";
import {
  saveMonth,
  classifyStatus,
  type SeoStrategyMonth,
} from "@/lib/seo-strategy-months";
import { enrichSeoStrategyMonth } from "@/lib/seo-month-enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

interface MonthResult {
  monthKey: string;
  headingText: string;
  status: "complete" | "active" | "forecast";
  saved: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.roleLevel, "seo_import:use")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { clientId, rawMarkdown, defaultYear } = body;

    if (!clientId || typeof rawMarkdown !== "string" || !rawMarkdown.trim()) {
      return NextResponse.json(
        { error: "clientId and rawMarkdown are required" },
        { status: 400 }
      );
    }

    const client = await getClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const year =
      typeof defaultYear === "number" && defaultYear > 1900
        ? defaultYear
        : new Date().getFullYear();

    // Markdown → TipTap JSON → chunked by month
    const tiptapJson = markdownToTiptap(rawMarkdown);
    const doc = JSON.parse(tiptapJson);
    const chunks = chunkTiptapByMonth(doc, year);

    if (chunks.length === 0) {
      return NextResponse.json(
        {
          error:
            "No month headings detected. Each month should be on its own line as a heading or bold line — e.g. 'March', 'March 2025', or 'SEO Updates April 2026'. Drop a year-only line like '2024' between months when the year flips.",
        },
        { status: 400 }
      );
    }

    // Pass 1 — save every chunk synchronously (fast, atomic).
    const results: MonthResult[] = [];
    const saved: SeoStrategyMonth[] = [];

    for (const chunk of chunks) {
      const status = classifyStatus(chunk.year, chunk.month);
      const result: MonthResult = {
        monthKey: chunk.monthKey,
        headingText: chunk.headingText,
        status,
        saved: false,
      };
      try {
        const row = await saveMonth({
          clientId,
          clientSlug: client.slug,
          monthKey: chunk.monthKey,
          rawContent: chunk.rawContent,
          status,
          lastEditedBy: session.teamMemberId,
        });
        result.saved = true;
        saved.push(row);
      } catch (err) {
        result.error = err instanceof Error ? err.message : "Save failed";
      }
      results.push(result);
    }

    // Pass 2 — enrich SERIALLY in the background after the response is sent.
    // Serial avoids the race condition in mergeIntoEnrichedContent where parallel
    // writes overwrite each other's pastMonths arrays.
    after(async () => {
      for (const row of saved) {
        try {
          await enrichSeoStrategyMonth({ ...row, enrichmentState: "running" });
        } catch (err) {
          console.error(
            "[seo-import] background enrichment failed for",
            row.monthKey,
            err instanceof Error ? err.message : err
          );
        }
      }
    });

    return NextResponse.json({
      clientId,
      clientSlug: client.slug,
      monthsImported: saved.length,
      monthsAttempted: results.length,
      results,
      backgrounded: true,
    });
  } catch (error) {
    console.error("SEO strategy import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
