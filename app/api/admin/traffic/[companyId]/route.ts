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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  if (!checkAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await params;

  try {
    const convex = getConvexClient();

    // Get company
    const company = await convex.query(api.identifiedCompanies.get, {
      id: companyId as any,
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Get all visitors from this company
    const visitors = await convex.query(api.siteVisitors.listByCompany, {
      companyId: companyId as any,
    });

    // Get page views for each visitor
    const visitorDetails = [];
    for (const visitor of visitors) {
      const pageViews = await convex.query(api.sitePageViews.listByVisitor, {
        visitorId: visitor._id,
        limit: 50,
      });
      visitorDetails.push({
        ...visitor,
        pageViews,
      });
    }

    // Calculate aggregate stats
    const totalVisits = visitors.reduce((sum, v) => sum + v.visitCount, 0);
    const allPageViews = visitorDetails.flatMap((v) => v.pageViews);
    const uniquePages = [...new Set(allPageViews.map((pv) => pv.path))];
    const totalTimeSeconds = allPageViews.reduce(
      (sum, pv) => sum + (pv.durationSeconds || 0),
      0
    );

    // Visit timeline (all visits sorted by time)
    const timeline = allPageViews
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 100);

    return NextResponse.json({
      company,
      visitors: visitorDetails,
      stats: {
        uniqueVisitors: visitors.length,
        totalVisits,
        uniquePages: uniquePages.length,
        topPages: uniquePages.slice(0, 10),
        totalTimeSeconds,
        firstVisit: visitors.reduce(
          (earliest, v) =>
            v.firstSeenAt < earliest ? v.firstSeenAt : earliest,
          visitors[0]?.firstSeenAt || ""
        ),
        lastVisit: visitors.reduce(
          (latest, v) => (v.lastSeenAt > latest ? v.lastSeenAt : latest),
          visitors[0]?.lastSeenAt || ""
        ),
      },
      timeline,
    });
  } catch (error) {
    console.error("Failed to fetch company traffic:", error);
    return NextResponse.json({ error: "Failed to fetch company traffic" }, { status: 500 });
  }
}

// Promote company to CRM lead
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = validateRoleLevel(session.roleLevel);
  if (!hasPermission(role, "traffic:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { companyId } = await params;

  try {
    const convex = getConvexClient();
    const leadId = await convex.mutation(api.identifiedCompanies.promoteToLead, {
      id: companyId as any,
    });
    return NextResponse.json({ leadId }, { status: 201 });
  } catch (error: any) {
    if (error?.message?.includes("Already promoted")) {
      return NextResponse.json({ error: "Already promoted to lead" }, { status: 400 });
    }
    console.error("Failed to promote to lead:", error);
    return NextResponse.json({ error: "Failed to promote" }, { status: 500 });
  }
}
