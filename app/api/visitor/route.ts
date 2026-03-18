import { NextRequest, NextResponse } from "next/server";
import { lookupVisitorByDevice, registerVisitor } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, clientSlug, deviceId } = body;

    if (!clientSlug || typeof clientSlug !== "string" || clientSlug.length > 100) {
      return NextResponse.json({ error: "Invalid clientSlug" }, { status: 400 });
    }

    if (!deviceId || typeof deviceId !== "string" || deviceId.length > 36) {
      return NextResponse.json({ error: "Invalid deviceId" }, { status: 400 });
    }

    if (action === "lookup") {
      const visitor = await lookupVisitorByDevice(clientSlug, deviceId);
      return NextResponse.json({ visitor });
    }

    if (action === "register") {
      const { visitorName, deviceType, userAgent } = body;

      if (!visitorName || typeof visitorName !== "string" || visitorName.trim().length === 0 || visitorName.length > 200) {
        return NextResponse.json({ error: "Invalid visitorName" }, { status: 400 });
      }

      const visitor = await registerVisitor(
        clientSlug,
        visitorName,
        deviceId,
        deviceType || "desktop",
        userAgent || ""
      );

      return NextResponse.json({ visitor });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Visitor API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
