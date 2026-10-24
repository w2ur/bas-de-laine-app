/**
 * Week arithmetic inside a financial month (Mon→Sun weeks; a week belongs to
 * the month its Monday falls in — see getFinancialMonthBounds).
 *
 * Pure: no database, no Next.js. `today` must come from todayInParisDate()
 * at the call site so the week is the household's, not the server's.
 */

import { getFinancialMonthBounds, getMondaysInFinancialMonth } from "@/lib/format";
import { roundToCents, isZeroAmount, amountGreaterThan } from "@/lib/money";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calendar-day difference between two local dates, ignoring time-of-day.
 * Computed via Date.UTC on the y/m/d components (not local getTime()
 * subtraction) so a DST transition — which shortens or lengthens a local
 * day's wall-clock-to-UTC span by one hour — can never shift the result.
 */
function daysBetween(from: Date, to: Date): number {
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((utcTo - utcFrom) / DAY_MS);
}

export interface FinancialWeek {
  /** 1-based position inside the financial month. */
  index: number;
  /** Number of weeks (Mondays) in the financial month. */
  count: number;
  /** Local-midnight Monday of the week. */
  monday: Date;
  /** Sunday of the week at 23:59:59.999. */
  sunday: Date;
}

export function getFinancialWeek(month: Date, today: Date): FinancialWeek {
  const { start } = getFinancialMonthBounds(month);
  const count = getMondaysInFinancialMonth(month);

  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const rawIndex = Math.floor(daysBetween(start, dayStart) / 7) + 1;
  const index = Math.min(Math.max(rawIndex, 1), count);

  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (index - 1) * 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);

  return { index, count, monday, sunday };
}

const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const dayOnly = new Intl.DateTimeFormat("fr-FR", { day: "numeric" });

/** « Semaine 3/4 · 21–27 sept. » or « Semaine 5/5 · 29 juin – 5 juil. » */
export function formatWeekLabel(week: FinancialWeek): string {
  const sameMonth = week.monday.getMonth() === week.sunday.getMonth();
  const range = sameMonth
    ? `${dayOnly.format(week.monday)}–${dayMonth.format(week.sunday)}`
    : `${dayMonth.format(week.monday)} – ${dayMonth.format(week.sunday)}`;
  return `Semaine ${week.index}/${week.count} · ${range}`;
}

export type FillCadence = "WEEKLY" | "MONTHLY";

export interface FillPlanEnvelope {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  fillCadence: FillCadence;
  weeklyIndicator: number;
  effectiveMonthlyBudget: number;
  /** FILL transactions only (month-scoped by the producer (getFillPlan); the plan further filters by window). */
  fills: { date: Date | string; amount: number }[];
}

export interface FillPlanRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  cadence: FillCadence;
  /** Proposed fill in euros, rounded to cents. */
  amount: number;
  /** A FILL already exists in the cadence window (week for WEEKLY, month for MONTHLY). */
  alreadyFilled: boolean;
  /** Sum of FILLs in the cadence window. */
  filledAmount: number;
  /** MONTHLY envelope past week 1 that has never received a fill this month. */
  late: boolean;
}

/**
 * Sum (and count) of `fills` whose date falls inside [start, end], inclusive.
 * One pass over `fills` feeds both `filledAmount` and `alreadyFilled` in the caller.
 *
 * Invariant this relies on: `end` is always end-of-day (23:59:59.999 local —
 * `week.sunday` / `monthBounds.end`), and Paris is east of UTC, so a
 * UTC-midnight calendar date (production fills are `@db.Date`, e.g.
 * `new Date("2026-09-22")`) always falls inside its own local day. A plain
 * Date comparison here therefore classifies a fill into the correct week or
 * month regardless of which of the two midnight conventions produced it —
 * as long as `end` stays end-of-day.
 */
function sumFillsInWindow(
  fills: FillPlanEnvelope["fills"],
  start: Date,
  end: Date
): { filledAmount: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const f of fills) {
    const d = new Date(f.date);
    if (d >= start && d <= end) {
      sum += f.amount;
      count++;
    }
  }
  return { filledAmount: roundToCents(sum), count };
}

/**
 * What the Monday ritual should propose this week.
 *
 * WEEKLY  → weeklyIndicator every week; window = the week.
 * MONTHLY → effectiveMonthlyBudget in week 1; window = the financial month.
 *           Past week 1 the row is omitted once fills in the window cover
 *           the full effective budget (amountGreaterThan(amount, filledAmount)
 *           is false). A partial fill keeps the row — flagged `alreadyFilled`,
 *           not `late` — with `amount` still the full effective month (Task 8
 *           seeds the input with amount − filledAmount; this function does not
 *           compute a remainder). A never-filled envelope is flagged `late`.
 * Rows with nothing to propose are dropped. Input order is preserved.
 */
export function computeFillPlan(
  envelopes: FillPlanEnvelope[],
  week: FinancialWeek,
  monthBounds: { start: Date; end: Date }
): FillPlanRow[] {
  const rows: FillPlanRow[] = [];

  for (const env of envelopes) {
    const isMonthly = env.fillCadence === "MONTHLY";
    const [start, end] = isMonthly ? [monthBounds.start, monthBounds.end] : [week.monday, week.sunday];
    const { filledAmount, count } = sumFillsInWindow(env.fills, start, end);
    const alreadyFilled = count > 0;

    const amount = roundToCents(isMonthly ? env.effectiveMonthlyBudget : env.weeklyIndicator);
    if (amount < 0 || isZeroAmount(amount)) continue;

    let late = false;
    if (isMonthly && week.index > 1) {
      if (!amountGreaterThan(amount, filledAmount)) continue; // fills cover the month → nothing left to propose
      late = !alreadyFilled;
    }

    rows.push({
      id: env.id,
      name: env.name,
      icon: env.icon,
      color: env.color,
      cadence: env.fillCadence,
      amount,
      alreadyFilled,
      filledAmount,
      late,
    });
  }

  return rows;
}

/**
 * Rows the ritual should still surface, i.e. with a remaining amount owed.
 *
 * `alreadyFilled` only means "at least one FILL exists in this window" — a
 * WEEKLY row topped up with a smaller manual fill (through fillEnvelope)
 * still counts as alreadyFilled but is not fully covered, so it must not be
 * dropped the way a fully-filled row is. This filters on the remainder
 * (amount − filledAmount, via amountGreaterThan) instead, matching the
 * top-up math the sheet already runs (Task 8's `amount − filledAmount` seed).
 */
export function filterPendingFillRows(rows: FillPlanRow[]): FillPlanRow[] {
  return rows.filter((r) => amountGreaterThan(r.amount, r.filledAmount));
}
