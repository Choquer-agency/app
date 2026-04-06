import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getOpenIssuesWithClients, createManualPaymentIssue } from "@/lib/payment-issues";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

const convex = getConvexClient();

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = request.nextUrl.searchParams.get("status");

    if (status === "open" || !status) {
      const issues = await getOpenIssuesWithClients();
      return NextResponse.json(issues);
    }

    const issues = await convex.query(api.paymentIssues.list, {
      status: status || undefined,
    });
    return NextResponse.json(issues);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch issues" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const issueId = await createManualPaymentIssue(clientId);
    return NextResponse.json({ id: issueId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create issue" },
      { status: 500 }
    );
  }
}
