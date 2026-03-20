import { NextRequest, NextResponse } from "next/server";
import { getAllPackages, createPackage } from "@/lib/packages";
import { getSession } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const packages = await getAllPackages();
    return NextResponse.json(packages);
  } catch (error) {
    console.error("Failed to fetch packages:", error);
    return NextResponse.json({ error: "Failed to fetch packages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Package name is required" }, { status: 400 });
    }

    const pkg = await createPackage({
      name: body.name.trim(),
      description: body.description || "",
      defaultPrice: body.defaultPrice || 0,
      category: body.category || "other",
      billingFrequency: body.billingFrequency || "monthly",
      hoursIncluded: body.hoursIncluded ?? null,
      includedServices: body.includedServices || [],
      setupFee: body.setupFee ?? 0,
      active: body.active ?? true,
    });

    return NextResponse.json(pkg, { status: 201 });
  } catch (error) {
    console.error("Failed to create package:", error);
    return NextResponse.json({ error: "Failed to create package" }, { status: 500 });
  }
}
