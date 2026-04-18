import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/permissions";
import { generateBriefing } from "@/lib/meeting-briefing";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session || !hasPermission(session.roleLevel, "nav:reports")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let memberId: string;
  let period: string;
  try {
    const body = await request.json();
    memberId = body.memberId;
    period = body.period;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!memberId || !period) {
    return NextResponse.json({ error: "memberId and period required" }, { status: 400 });
  }

  // Use SSE stream with keep-alive to prevent Safari's 60s timeout
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send keep-alive pings every 10s while Opus generates
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 10000);

      try {
        const result = await generateBriefing(memberId, period);

        // Save to Convex (non-blocking)
        try {
          const convex = getConvexClient();
          await (convex as any).mutation(api.meetingBriefings.create, {
            teamMemberId: memberId,
            createdById: session!.teamMemberId || memberId,
            period,
            meetingDate: new Date().toISOString().split("T")[0],
            briefingData: result.briefing,
            generationMeta: result.generationMeta,
          });
        } catch (saveErr) {
          console.error("Failed to save briefing:", saveErr);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
      } catch (error) {
        console.error("Briefing generation failed:", error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate briefing" })}\n\n`)
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
    },
  });
}
