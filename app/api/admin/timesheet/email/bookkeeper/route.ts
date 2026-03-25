import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { sendBookkeeperReport } from "@/lib/email";

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "timesheet:export")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { bookkeeperEmail, companyName, periodStart, periodEnd, employees } = body;

    if (!bookkeeperEmail) {
      return NextResponse.json({ error: "Bookkeeper email is required" }, { status: 400 });
    }

    await sendBookkeeperReport({
      bookkeeperEmail,
      companyName: companyName || "Choquer Agency",
      periodStart,
      periodEnd,
      employees,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send bookkeeper report:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
