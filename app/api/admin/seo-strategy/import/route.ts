import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { getClientById } from "@/lib/clients";
import { chunkTiptapByMonth } from "@/lib/seo-import-chunker";
import {
  saveMonth,
  classifyStatus,
  type SeoStrategyMonth,
} from "@/lib/seo-strategy-months";
import { enrichSeoStrategyMonth } from "@/lib/seo-month-enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const ENRICH_CONCURRENCY = 3;

interface MonthResult {
  monthKey: string;
  headingText: string;
  status: "complete" | "active" | "forecast";
  saved: boolean;
  enriched: boolean;
  error?: string;
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
    const { clientId, rawContent, defaultYear } = body;

    if (!clientId || typeof rawContent !== "string") {
      return NextResponse.json(
        { error: "clientId and rawContent (TipTap JSON) are required" },
        { status: 400 }
      );
    }

    const client = await getClientById(clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    let doc: unknown;
    try {
      doc = JSON.parse(rawContent);
    } catch {
      return NextResponse.json(
        { error: "rawContent must be valid TipTap JSON" },
        { status: 400 }
      );
    }

    const year =
      typeof defaultYear === "number" && defaultYear > 1900
        ? defaultYear
        : new Date().getFullYear();

    const chunks = chunkTiptapByMonth(doc as never, year);

    if (chunks.length === 0) {
      return NextResponse.json(
        {
          error:
            "No month headings detected. Make sure each month is its own heading (e.g. 'March', 'March 2025', or 'SEO Updates April 2026').",
        },
        { status: 400 }
      );
    }

    const results: MonthResult[] = [];

    // Pass 1 — save every chunk (fast)
    const savedChunks: Array<{ saved: SeoStrategyMonth; result: MonthResult }> = [];

    for (const chunk of chunks) {
      const status = classifyStatus(chunk.year, chunk.month);
      const result: MonthResult = {
        monthKey: chunk.monthKey,
        headingText: chunk.headingText,
        status,
        saved: false,
        enriched: false,
      };
      try {
        const saved = await saveMonth({
          clientId,
          clientSlug: client.slug,
          monthKey: chunk.monthKey,
          rawContent: chunk.rawContent,
          status,
          lastEditedBy: session.teamMemberId,
        });
        result.saved = true;
        savedChunks.push({ saved, result });
      } catch (err) {
        result.error = err instanceof Error ? err.message : "Save failed";
      }
      results.push(result);
    }

    // Pass 2 — enrich each saved chunk (slow). Run in parallel batches so the
    // dashboard has clean polished content the moment the import finishes.
    for (let i = 0; i < savedChunks.length; i += ENRICH_CONCURRENCY) {
      const batch = savedChunks.slice(i, i + ENRICH_CONCURRENCY);
      await Promise.all(
        batch.map(async ({ saved, result }) => {
          try {
            await enrichSeoStrategyMonth({ ...saved, enrichmentState: "running" });
            result.enriched = true;
          } catch (err) {
            result.error = err instanceof Error ? err.message : "Enrichment failed";
          }
        })
      );
    }

    return NextResponse.json({
      clientId,
      clientSlug: client.slug,
      monthsImported: results.filter((r) => r.saved).length,
      monthsEnriched: results.filter((r) => r.enriched).length,
      monthsAttempted: results.length,
      results,
    });
  } catch (error) {
    console.error("SEO strategy import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
