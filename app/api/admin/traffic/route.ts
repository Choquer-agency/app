import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { hasPermission, validateRoleLevel } from "@/lib/permissions";

function checkAccess(request: NextRequest): boolean {
  const session = getSession(request);
  if (!session) return false;
  const role = validateRoleLevel(session.roleLevel);
  return hasPermission(role, "traffic:view");
}

export async function GET(request: NextRequest) {
  if (!checkAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();

    // Get all tracked sites
    const sites = await convex.query(api.trackedSites.list, {});
    const activeSites = sites.filter((s: any) => s.active);

    // Gather visitors across all sites
    const allVisitors: any[] = [];
    for (const site of activeSites) {
      const visitors = await convex.query(api.siteVisitors.listBySite, {
        siteId: site._id,
        limit: 200,
      });
      allVisitors.push(
        ...visitors.map((v: any) => ({ ...v, siteName: site.name, siteDomain: site.domain }))
      );
    }

    // Sort by lastSeenAt descending
    allVisitors.sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    );

    // Gather unique company IDs
    const companyIds = [
      ...new Set(allVisitors.map((v) => v.companyId).filter(Boolean)),
    ];

    // Fetch companies
    const companies: Record<string, any> = {};
    for (const cid of companyIds) {
      const company = await convex.query(api.identifiedCompanies.get, { id: cid });
      if (company) companies[cid] = company;
    }

    // Build stats
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const visitors7d = allVisitors.filter(
      (v) => new Date(v.lastSeenAt).getTime() > sevenDaysAgo
    );
    const identifiedVisitors7d = visitors7d.filter((v) => v.companyId);
    const highIntentVisitors = allVisitors.filter(
      (v) => v.intentLevel === "high_intent"
    );

    // Group visitors by company for the table
    const companyVisitors = new Map<string, any[]>();
    const unknownVisitors: any[] = [];

    for (const v of allVisitors) {
      if (v.companyId && companies[v.companyId]) {
        if (!companyVisitors.has(v.companyId)) {
          companyVisitors.set(v.companyId, []);
        }
        companyVisitors.get(v.companyId)!.push(v);
      } else {
        unknownVisitors.push(v);
      }
    }

    // Build company rows for table
    const companyRows = Array.from(companyVisitors.entries()).map(
      ([companyId, visitors]) => {
        const company = companies[companyId];
        const totalVisits = visitors.reduce((sum: number, v: any) => sum + v.visitCount, 0);
        const lastVisit = visitors.reduce(
          (latest: string, v: any) =>
            v.lastSeenAt > latest ? v.lastSeenAt : latest,
          visitors[0].lastSeenAt
        );
        const hasHighIntent = visitors.some(
          (v: any) => v.intentLevel === "high_intent"
        );
        const intentLevel = hasHighIntent
          ? "high_intent"
          : visitors.some((v: any) => v.intentLevel === "returning")
            ? "returning"
            : "new";

        return {
          companyId,
          companyName: company.name,
          domain: company.domain,
          industry: company.industry,
          employeeCount: company.employeeCount,
          country: company.country,
          city: company.city,
          leadId: company.leadId,
          uniqueVisitors: visitors.length,
          totalVisits,
          lastVisit,
          intentLevel,
        };
      }
    );

    // Sort: high_intent first, then by last visit
    companyRows.sort((a, b) => {
      if (a.intentLevel === "high_intent" && b.intentLevel !== "high_intent") return -1;
      if (b.intentLevel === "high_intent" && a.intentLevel !== "high_intent") return 1;
      return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
    });

    return NextResponse.json({
      stats: {
        totalVisitors7d: visitors7d.length,
        identifiedCompanies7d: new Set(identifiedVisitors7d.map((v) => v.companyId)).size,
        identificationRate:
          visitors7d.length > 0
            ? Math.round((identifiedVisitors7d.length / visitors7d.length) * 100)
            : 0,
        highIntentCount: highIntentVisitors.length,
      },
      companies: companyRows,
      unknownVisitorCount: unknownVisitors.length,
    });
  } catch (error) {
    console.error("Failed to fetch traffic data:", error);
    return NextResponse.json({ error: "Failed to fetch traffic data" }, { status: 500 });
  }
}
