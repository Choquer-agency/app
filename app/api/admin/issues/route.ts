import { NextRequest, NextResponse } from "next/server";
import { getAllClients } from "@/lib/clients";
import { getEnrichedContent, getActedApprovals } from "@/lib/db";
import { getSession } from "@/lib/admin-auth";
import { getTeamMembers } from "@/lib/team-members";

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

      // Skip goal checks for onboarding clients (strategy not built yet)
      if (enriched._onboarding) continue;

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
        }
      }
    }

    // Fetch acted-on approvals as notifications (approved + rejected with feedback)
    let approvalNotifications: Array<{
      id: number; clientName: string; clientSlug: string;
      title: string; status: string; feedback: string | null; actedAt: string;
    }> = [];
    try {
      const acted = await getActedApprovals();
      approvalNotifications = acted.map((a) => ({
        id: a.id as number,
        clientName: (a.client_name as string) || (a.client_slug as string),
        clientSlug: a.client_slug as string,
        title: a.title as string,
        status: a.status as string,
        feedback: (a.feedback as string) || null,
        actedAt: (a.updated_at as Date)?.toISOString?.() || String(a.updated_at),
      }));
    } catch {
      // approvals table may not exist yet
    }

    // Birthday notifications
    let birthdayNotifications: Array<{
      name: string;
      daysUntil: number;
      isToday: boolean;
      birthdayDisplay: string;
    }> = [];
    try {
      const teamMembers = await getTeamMembers();
      const today = new Date();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();

      for (const member of teamMembers) {
        if (!member.birthday) continue;
        const bday = new Date(member.birthday + "T00:00:00");
        const bdayMonth = bday.getMonth();
        const bdayDate = bday.getDate();

        // Calculate days until birthday this year
        const thisYearBday = new Date(today.getFullYear(), bdayMonth, bdayDate);
        let diff = Math.ceil((thisYearBday.getTime() - new Date(today.getFullYear(), todayMonth, todayDate).getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) diff += 365; // already passed this year

        const isToday = diff === 0;
        if (diff <= 7) {
          const dayName = thisYearBday.toLocaleDateString("en-US", { weekday: "long" });
          birthdayNotifications.push({
            name: member.name,
            daysUntil: diff,
            isToday,
            birthdayDisplay: isToday
              ? "today"
              : diff === 1
              ? "tomorrow"
              : `on ${dayName}`,
          });
        }
      }
      // Sort: today first, then closest upcoming
      birthdayNotifications.sort((a, b) => a.daysUntil - b.daysUntil);
    } catch {
      // team_members table may not exist yet
    }

    // Work anniversary notifications
    let anniversaryNotifications: Array<{
      name: string;
      daysUntil: number;
      isToday: boolean;
      years: number;
      anniversaryDisplay: string;
    }> = [];
    try {
      const teamMembers = await getTeamMembers();
      const today = new Date();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();

      for (const member of teamMembers) {
        if (!member.startDate) continue;
        const start = new Date(member.startDate + "T00:00:00");
        const startMonth = start.getMonth();
        const startDate = start.getDate();

        // Calculate years at next anniversary
        let nextAnniversaryYear = today.getFullYear();
        const thisYearAnniv = new Date(nextAnniversaryYear, startMonth, startDate);
        const todayFlat = new Date(nextAnniversaryYear, todayMonth, todayDate);
        let diff = Math.ceil((thisYearAnniv.getTime() - todayFlat.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) {
          diff += 365;
          nextAnniversaryYear++;
        }

        const years = nextAnniversaryYear - start.getFullYear();
        if (years < 1) continue; // hasn't been a year yet

        const isToday = diff === 0;
        if (diff <= 7) {
          const dayName = new Date(nextAnniversaryYear, startMonth, startDate).toLocaleDateString("en-US", { weekday: "long" });
          anniversaryNotifications.push({
            name: member.name,
            daysUntil: diff,
            isToday,
            years,
            anniversaryDisplay: isToday
              ? "today"
              : diff === 1
              ? "tomorrow"
              : `on ${dayName}`,
          });
        }
      }
      anniversaryNotifications.sort((a, b) => a.daysUntil - b.daysUntil);
    } catch {
      // team_members table may not exist yet
    }

    return NextResponse.json({ issues, approvalNotifications, birthdayNotifications, anniversaryNotifications, scannedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Issues scan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 }
    );
  }
}
