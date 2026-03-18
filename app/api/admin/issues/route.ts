import { NextRequest, NextResponse } from "next/server";
import { getAllClients } from "@/lib/clients";
import { getEnrichedContent } from "@/lib/db";
import { getSession } from "@/lib/admin-auth";

interface GoalIssue {
  clientName: string;
  clientSlug: string;
  goal: string;
  issue: string;
  severity: "warning" | "error";
}

// Parse deadline to check if expired
function isDeadlineExpired(deadline: string): boolean {
  const now = new Date();
  const quarterMatch = deadline.match(/Q(\d)\s+(\d{4})/);
  if (quarterMatch) {
    const q = parseInt(quarterMatch[1]);
    const year = parseInt(quarterMatch[2]);
    const endOfQuarter = new Date(year, q * 3, 0);
    return now > endOfQuarter;
  }
  const monthMatch = deadline.match(/(\w+)\s+(\d{4})/);
  if (monthMatch) {
    const year = parseInt(monthMatch[2]);
    const monthIndex = new Date(`${monthMatch[1]} 1, ${year}`).getMonth();
    if (!isNaN(monthIndex)) {
      return now > new Date(year, monthIndex + 1, 0);
    }
  }
  return false;
}

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clients = await getAllClients();
    const issues: GoalIssue[] = [];

    for (const client of clients) {
      if (!client.active) continue;

      // Load enriched data from database
      const dbResult = await getEnrichedContent(client.slug);
      if (!dbResult?.enrichedData) {
        issues.push({
          clientName: client.name,
          clientSlug: client.slug,
          goal: "—",
          issue: "No enriched data — run a sync",
          severity: "error",
        });
        continue;
      }

      const enriched = dbResult.enrichedData;
      const goals = enriched.goals || [];

      if (goals.length === 0) {
        issues.push({
          clientName: client.name,
          clientSlug: client.slug,
          goal: "—",
          issue: "No goals set in Notion",
          severity: "warning",
        });
        continue;
      }

      for (const goal of goals) {
        // Check for expired deadlines
        if (goal.deadline && isDeadlineExpired(goal.deadline)) {
          issues.push({
            clientName: client.name,
            clientSlug: client.slug,
            goal: goal.goal,
            issue: `Goal expired (deadline: ${goal.deadline}) — remove or update in Notion`,
            severity: "error",
          });
          continue;
        }

        // Check for missing targetMetricType
        if (!goal.targetMetricType) {
          issues.push({
            clientName: client.name,
            clientSlug: client.slug,
            goal: goal.goal,
            issue: "No metric type — progress can't be verified with live data",
            severity: "error",
          });
          continue;
        }

        // Check for missing targetValue
        if (!goal.targetValue) {
          issues.push({
            clientName: client.name,
            clientSlug: client.slug,
            goal: goal.goal,
            issue: "No target value — progress can't be calculated",
            severity: "error",
          });
          continue;
        }

        // Check if the required integration is connected
        const metricType = goal.targetMetricType;
        if ((metricType === "organic_sessions" || metricType === "sessions") && !client.ga4PropertyId) {
          issues.push({
            clientName: client.name,
            clientSlug: client.slug,
            goal: goal.goal,
            issue: `Needs GA4 connected to track "${metricType}"`,
            severity: "error",
          });
        } else if ((metricType === "clicks" || metricType === "impressions") && !client.gscSiteUrl) {
          issues.push({
            clientName: client.name,
            clientSlug: client.slug,
            goal: goal.goal,
            issue: `Needs Search Console connected to track "${metricType}"`,
            severity: "error",
          });
        } else if (metricType === "leads") {
          issues.push({
            clientName: client.name,
            clientSlug: client.slug,
            goal: goal.goal,
            issue: "Leads are manually tracked — progress won't auto-update",
            severity: "warning",
          });
        }
      }
    }

    return NextResponse.json({ issues, scannedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Issues scan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 }
    );
  }
}
