import { NextRequest, NextResponse } from "next/server";
import { cancelAssignment, getClientPackages } from "@/lib/client-packages";
import { addNote } from "@/lib/client-notes";
import { getSession } from "@/lib/admin-auth";
import { notifyPackageChanged } from "@/lib/notification-triggers";
import { getClientById } from "@/lib/clients";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cpId: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, cpId } = await params;
    const body = await request.json();

    const cancelType = body.cancelType as "30_day" | "immediate";
    if (cancelType !== "30_day" && cancelType !== "immediate") {
      return NextResponse.json({ error: "Invalid cancelType" }, { status: 400 });
    }

    const assignment = await cancelAssignment(
      cpId,
      cancelType,
      body.cancellationFee,
      session.name
    );

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Auto-log cancellation
    const pkgName = assignment.packageName || `Package #${assignment.packageId}`;
    const noticeLabel = cancelType === "30_day"
      ? `30-day notice, effective ${assignment.effectiveEndDate}`
      : "canceled immediately";
    const feeLabel = body.cancellationFee ? `, cancellation fee: $${body.cancellationFee}` : "";
    await addNote({
      clientId: id,
      author: session.name,
      noteType: "package_change",
      content: `${pkgName} canceled (${noticeLabel}${feeLabel})`,
    }).catch(() => {});

    // Notify owner/c_suite
    const client = await getClientById(id).catch(() => null);
    if (client) {
      notifyPackageChanged(id, client.name, "canceled", pkgName, session.teamMemberId).catch(() => {});
    }

    return NextResponse.json(assignment);
  } catch (error) {
    console.error("Failed to cancel package:", error);
    return NextResponse.json({ error: "Failed to cancel package" }, { status: 500 });
  }
}
