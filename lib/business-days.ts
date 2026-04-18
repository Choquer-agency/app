import { getConvexClient } from "./convex-server";
import { api } from "@/convex/_generated/api";

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export async function loadHolidaySet(): Promise<Set<string>> {
  const convex = getConvexClient();
  const events = await convex.query(api.bulletin.listCalendarEvents, {});
  const set = new Set<string>();
  for (const ev of events) {
    if (ev.eventType === "holiday") set.add(ev.eventDate);
  }
  return set;
}

export function nextBusinessDay(start: Date, holidays: Set<string>): Date {
  const d = new Date(start);
  while (isWeekend(d) || holidays.has(toIsoDate(d))) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function addCalendarDaysThenSnapToBusinessDay(
  start: Date,
  calendarDays: number,
  holidays: Set<string>
): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + calendarDays);
  return nextBusinessDay(d, holidays);
}
