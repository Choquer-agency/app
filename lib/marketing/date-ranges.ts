import type { DateRangeInput, DateRangePreset, ResolvedDateRange } from "./types";

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), q, 1));
}

function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function startOfWeek(d: Date): Date {
  // Monday as start of week
  const day = d.getUTCDay(); // 0 = Sun
  const diff = (day + 6) % 7;
  return addDays(d, -diff);
}

export function resolveDateRange(input: DateRangeInput, now: Date = new Date()): ResolvedDateRange {
  if ("start" in input) {
    return { start: input.start, end: input.end, label: `${input.start} to ${input.end}` };
  }

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = addDays(today, -1);

  const rangeByPreset: Record<DateRangePreset, () => { start: Date; end: Date }> = {
    today: () => ({ start: today, end: today }),
    yesterday: () => ({ start: yesterday, end: yesterday }),
    last_7_days: () => ({ start: addDays(yesterday, -6), end: yesterday }),
    last_14_days: () => ({ start: addDays(yesterday, -13), end: yesterday }),
    last_28_days: () => ({ start: addDays(yesterday, -27), end: yesterday }),
    last_30_days: () => ({ start: addDays(yesterday, -29), end: yesterday }),
    last_90_days: () => ({ start: addDays(yesterday, -89), end: yesterday }),
    last_12_months: () => ({
      start: new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate())),
      end: yesterday,
    }),
    mtd: () => ({ start: startOfMonth(today), end: yesterday }),
    qtd: () => ({ start: startOfQuarter(today), end: yesterday }),
    ytd: () => ({ start: startOfYear(today), end: yesterday }),
    last_week: () => {
      const thisMonday = startOfWeek(today);
      const lastMonday = addDays(thisMonday, -7);
      const lastSunday = addDays(thisMonday, -1);
      return { start: lastMonday, end: lastSunday };
    },
    last_month: () => {
      const firstThis = startOfMonth(today);
      const firstLast = new Date(Date.UTC(firstThis.getUTCFullYear(), firstThis.getUTCMonth() - 1, 1));
      const lastDayLast = addDays(firstThis, -1);
      return { start: firstLast, end: lastDayLast };
    },
    last_quarter: () => {
      const thisQ = startOfQuarter(today);
      const lastQ = new Date(Date.UTC(thisQ.getUTCFullYear(), thisQ.getUTCMonth() - 3, 1));
      const endLastQ = addDays(thisQ, -1);
      return { start: lastQ, end: endLastQ };
    },
    last_year: () => {
      const startLast = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
      const endLast = new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31));
      return { start: startLast, end: endLast };
    },
  };

  const fn = rangeByPreset[input.preset];
  if (!fn) throw new Error(`Unknown date range preset: ${input.preset}`);
  const { start, end } = fn();
  return { start: toISO(start), end: toISO(end), label: input.preset };
}
