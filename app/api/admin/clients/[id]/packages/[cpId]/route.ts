import { NextRequest, NextResponse } from "next/server";
import { updateAssignment, removeAssignment, syncClientMrr, getClientPackages } from "@/lib/client-packages";
import { addNote } from "@/lib/client-notes";
import { getSession } from "@/lib/admin-auth";

export async function PUT(
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
    const assignment = await updateAssignment(cpId, body);

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Sync MRR on clients table
    await syncClientMrr(id);

    // Auto-log package update
    const pkgName = assignment.packageName || `Package #${assignment.packageId}`;
    const changes: string[] = [];
    if (body.customPrice !== undefined) changes.push(`price → $${body.customPrice}/mo`);
    if (body.contractEndDate !== undefined) changes.push(body.contractEndDate ? `contract end → ${body.contractEndDate}` : "contract end removed");
    if (body.active !== undefined) changes.push(body.active ? "reactivated" : "deactivated");
    if (changes.length > 0) {
      await addNote({
        clientId: id,
        author: session.name,
        noteType: "package_change",
        content: `${pkgName} updated: ${changes.join(", ")}`,
      }).catch(() => {});
    }

    return NextResponse.json(assignment);
  } catch (error) {
    console.error("Failed to update assignment:", error);
    return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cpId: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, cpId } = await params;
    // Fetch assignment details before removing for the log
    const existing = (await getClientPackages(id)).find(
      (p) => p.id === cpId
    );
    const pkgName = existing?.packageName || `Package #${cpId}`;
    const price = existing?.customPrice ?? existing?.packageDefaultPrice ?? 0;

    const success = await removeAssignment(cpId);

    if (!success) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Sync MRR on clients table
    await syncClientMrr(id);

    // Auto-log package removal
    await addNote({
      clientId: id,
      author: session.name,
      noteType: "package_change",
      content: `${pkgName} removed ($${price.toLocaleString()}/mo)`,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove assignment:", error);
    return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
  }
}
