import { NextRequest, NextResponse } from "next/server";
import { logActivities } from "@/lib/db";
import { TrackingEvent } from "@/types";

const VALID_EVENT_TYPES = new Set([
  "page_view",
  "section_view",
  "accordion_open",
  "chart_interact",
  "link_click",
  "copy_event",
  "time_on_page",
  "cta_click",
  "keyword_sort",
  "timerange_toggle",
]);

const MAX_EVENTS_PER_REQUEST = 100;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const events: TrackingEvent[] = Array.isArray(body) ? body : [body];

    if (events.length > MAX_EVENTS_PER_REQUEST) {
      return new NextResponse(null, { status: 400 });
    }

    // Validate events
    const validEvents = events.filter(
      (e) =>
        e.clientSlug &&
        typeof e.clientSlug === "string" &&
        e.clientSlug.length <= 100 &&
        VALID_EVENT_TYPES.has(e.eventType) &&
        e.sessionId &&
        typeof e.sessionId === "string" &&
        (e.visitorId === undefined || typeof e.visitorId === "number")
    );

    if (validEvents.length > 0) {
      await logActivities(validEvents);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Track API error:", error);
    return new NextResponse(null, { status: 500 });
  }
}
