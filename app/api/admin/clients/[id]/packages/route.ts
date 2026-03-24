import { NextRequest, NextResponse } from "next/server";
import { getClientPackages, assignPackage, syncClientMrr } from "@/lib/client-packages";
import { addNote } from "@/lib/client-notes";
import { getPackageById } from "@/lib/packages";
import { getSession } from "@/lib/admin-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const packages = await getClientPackages(id);
    return NextResponse.json(packages);
  } catch (error) {
    console.error("Failed to fetch client packages:", error);
    return NextResponse.json({ error: "Failed to fetch client packages" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.packageId) {
      return NextResponse.json({ error: "Package ID is required" }, { status: 400 });
    }

    const assignment = await assignPackage({
      clientId: id,
      packageId: body.packageId,
      customPrice: body.customPrice ?? null,
      customHours: body.customHours ?? null,
      applySetupFee: body.applySetupFee ?? false,
      customSetupFee: body.customSetupFee ?? null,
      signupDate: body.signupDate,
      contractEndDate: body.contractEndDate ?? null,
      notes: body.notes || "",
    });

    // Sync MRR on clients table
    await syncClientMrr(id);

    // Auto-log package assignment with full details
    const pkg = await getPackageById(body.packageId).catch(() => null);
    const pkgName = pkg?.name || `Package #${body.packageId}`;
    const price = body.customPrice ?? pkg?.defaultPrice ?? 0;
    const hours = body.customHours ?? pkg?.hoursIncluded;
    const parts = [`${pkgName} — $${price.toLocaleString()}/mo`];
    if (hours) parts.push(`${hours}h/mo`);
    if (body.applySetupFee) {
      const setupFeeAmt = body.customSetupFee ?? pkg?.setupFee ?? 0;
      parts.push(`setup fee: $${setupFeeAmt.toLocaleString()}`);
    }
    if (body.signupDate) parts.push(`starts ${body.signupDate}`);
    if (body.contractEndDate) parts.push(`ends ${body.contractEndDate}`);
    await addNote({
      clientId: id,
      author: session.name,
      noteType: "package_change",
      content: parts.join(", "),
    }).catch(() => {});

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error("Failed to assign package:", error);
    return NextResponse.json({ error: "Failed to assign package" }, { status: 500 });
  }
}
