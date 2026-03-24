const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format a date string as a friendly display: "Mar 21" or "Mar 21, 2027" (year only if not current year)
 */
export function friendlyDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${d.getFullYear()}`;
}

/**
 * Format with day of week: "Wed, Mar 21" or "Wed, Mar 21, 2027"
 */
export function friendlyDateWithDay(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const dow = days[d.getDay()];
  if (d.getFullYear() === now.getFullYear()) {
    return `${dow}, ${month} ${day}`;
  }
  return `${dow}, ${month} ${day}, ${d.getFullYear()}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Format a datetime string: "Mar 21, 2:30 PM" or "Mar 21, 2025, 2:30 PM"
 */
export function friendlyDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) {
    return `${month} ${day}, ${time}`;
  }
  return `${month} ${day}, ${d.getFullYear()}, ${time}`;
}

/**
 * Format month only: "Mar 2025" or "Mar" (if current year)
 */
export function friendlyMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length <= 7 ? "-01T00:00:00" : "T12:00:00"));
  const now = new Date();
  const month = MONTHS[d.getMonth()];
  if (d.getFullYear() === now.getFullYear()) {
    return month;
  }
  return `${month} ${d.getFullYear()}`;
}

/**
 * Format full month + year: "March 2025"
 */
export function friendlyMonthFull(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length <= 7 ? "-01T00:00:00" : "T12:00:00"));
  const now = new Date();
  const month = MONTHS_FULL[d.getMonth()];
  if (d.getFullYear() === now.getFullYear()) {
    return month;
  }
  return `${month} ${d.getFullYear()}`;
}
