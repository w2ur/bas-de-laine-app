import { cache } from "react";

const eurFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

export function formatCurrency(value: number | { toString(): string } | string): string {
  const num = typeof value === "number" ? value : Number(value);
  return eurFormatter.format(num);
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateFormatter.format(d);
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return shortDateFormatter.format(d);
}

const instantShortFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/**
 * Short date of a point in time (a createdAt), as the household sees it.
 * formatDateShort reads the server timezone, which is right for UTC-midnight
 * calendar dates but shifts a late-evening timestamp back a day on UTC servers.
 */
export function formatInstantShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return instantShortFormatter.format(d);
}

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

/** A ratio as a French percentage: 0.625 -> "63 %", with a no-break space (U+00A0). */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

/**
 * Week-based financial month boundaries.
 * A week belongs to a month if its Monday falls in that calendar month.
 * start = first Monday in the calendar month
 * end   = Sunday of the last week whose Monday is in the calendar month
 */
export function getFinancialMonthBounds(month: Date): { start: Date; end: Date } {
  const year = month.getFullYear();
  const m = month.getMonth();

  // First day of calendar month
  const first = new Date(year, m, 1);
  // Day of week: 0=Sun,1=Mon,...6=Sat
  const firstDow = first.getDay();
  // First Monday: if the 1st is Mon (1) offset=0, Tue(2)=6, Wed(3)=5, ...Sun(0)=1
  const daysToFirstMon = firstDow === 0 ? 1 : firstDow === 1 ? 0 : 8 - firstDow;
  const start = new Date(year, m, 1 + daysToFirstMon);

  // Last day of calendar month
  const lastDay = new Date(year, m + 1, 0);
  const lastDow = lastDay.getDay();
  // Last Monday in the calendar month
  const daysBackToMon = lastDow === 0 ? 6 : lastDow - 1;
  const lastMonday = new Date(year, m + 1, -daysBackToMon);
  // End = that Monday's Sunday (6 days later), at end of day (23:59:59.999)
  const end = new Date(lastMonday.getFullYear(), lastMonday.getMonth(), lastMonday.getDate() + 6, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Counts the number of Mondays (= weeks) in a financial month.
 * Since financial month bounds are always Mon→Sun aligned, this is the
 * total span divided by 7 days (computed in weeks, not days+1).
 */
export function getMondaysInFinancialMonth(month: Date): number {
  const { start, end } = getFinancialMonthBounds(month);
  return Math.round((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function getFinancialMonthKey(month: Date): string {
  const y = month.getFullYear();
  const m = String(month.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Determines which financial month today falls in.
 * Checks the current calendar month first; if today is before its financial start,
 * falls back to the previous month.
 *
 * `now` is derived from `todayInParisDate()` (the household's timezone), not
 * a raw `new Date()`. A server running in UTC would otherwise read "today" up
 * to two hours late — e.g. at 22:30 UTC on the last Sunday of August, Paris
 * has already crossed into Monday (the financial month's start), so the
 * month must already be reported as September.
 *
 * Wrapped in React `cache()` so every caller within one request (layout,
 * page) gets back the *same* Date object reference. This matters beyond
 * avoiding redundant computation: `getEnvelopes()` is itself cache()-wrapped
 * and keyed by its `month` argument via referential (WeakMap) identity, so
 * two calls to `getCurrentFinancialMonth()` returning two distinct-but-equal
 * Date instances would silently defeat that cache and still run two queries.
 */
export const getCurrentFinancialMonth = cache(function getCurrentFinancialMonth(): Date {
  const now = todayInParisDate();
  const candidate = new Date(now.getFullYear(), now.getMonth(), 1);
  const bounds = getFinancialMonthBounds(candidate);

  if (now >= bounds.start) {
    return candidate;
  }
  // Today is before this month's financial start → belongs to previous month
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
});

export function getMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Returns today's date as a "yyyy-MM-dd" string in the Europe/Paris timezone,
 * then constructs and returns the corresponding UTC-midnight Date object.
 *
 * This mirrors what the calendar date schema produces (new Date("yyyy-MM-dd") =
 * UTC midnight), so the fallback date in server actions aligns with the
 * UTC-based financial month bounds even when the server runs in UTC and the
 * household is in Paris.
 */
export function todayInParisDate(): Date {
  const parisDateString = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date());
  return new Date(parisDateString);
}

const dayShortFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * A calendar date (stored at UTC midnight) as a short French day: « ven. 9 oct. ».
 * Read in UTC so the stored day is the shown day whatever the server zone.
 */
export function formatDayShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dayShortFormatter.format(d);
}

const dayMonthFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/**
 * A week's span on one line: « 5–11 oct. », or « 28 sept.–4 oct. » across a
 * month. Week bounds are built in the server's local zone (date-fns, like
 * getFinancialMonthBounds), so they are read in it too: server-side only.
 */
export function formatWeekSpan(start: Date | string, end: Date | string): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${dayMonthFormatter.format(e)}`;
  return `${dayMonthFormatter.format(s)}–${dayMonthFormatter.format(e)}`;
}

/** « vendredi 9 octobre » → « Vendredi 9 octobre »: the first letter only (CSS capitalize takes every word). */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
