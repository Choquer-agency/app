/**
 * Builds an array of business days (Mon-Fri) between start and end dates.
 * Returns the array and a lookup function to convert any date to an X position.
 */
export interface BusinessDay {
  date: Date;
  iso: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, ...
  index: number; // sequential business day index
}

export function buildBusinessDays(start: Date, end: Date): BusinessDay[] {
  const days: BusinessDay[] = [];
  const d = new Date(start);
  d.setHours(12, 0, 0, 0);
  const endTime = end.getTime();
  let idx = 0;

  while (d.getTime() <= endTime) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push({
        date: new Date(d),
        iso: d.toISOString().split("T")[0],
        dayOfWeek: dow,
        index: idx,
      });
      idx++;
    }
    d.setDate(d.getDate() + 1);
  }

  return days;
}

/**
 * Given a date string, find the business day index (X position).
 * If the date falls on a weekend, snaps to the next Monday.
 */
export function dateToBusinessDayIndex(
  dateStr: string,
  businessDays: BusinessDay[]
): number {
  const target = dateStr.slice(0, 10); // "YYYY-MM-DD"

  // Binary search or linear scan
  for (let i = 0; i < businessDays.length; i++) {
    if (businessDays[i].iso >= target) return i;
  }
  return businessDays.length - 1;
}

/**
 * Get X pixel position for a date.
 */
export function dateToX(dateStr: string, businessDays: BusinessDay[], dayWidth: number): number {
  return dateToBusinessDayIndex(dateStr, businessDays) * dayWidth;
}
