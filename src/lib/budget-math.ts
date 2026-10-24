/**
 * Shared week-scaling and goal-contribution math for budget envelopes.
 *
 * Extracted so the envelope queries (getEnvelopes / getEnvelopeDetail) and the
 * dashboard stats (computeEnvelopeStats) apply ONE rounding policy instead of
 * three slightly different ones. No database or Next.js dependencies — pure and
 * testable.
 */

import { roundToCents } from "@/lib/money";
import type { FillCadence } from "@/lib/week-logic";

/** A "monthly" budget spread over 52 weeks: 12 months / 52 weeks per week. */
const WEEKS_PER_MONTH = 12 / 52;

/**
 * The display suffix for an envelope's monthly budget figure. Always
 * "/mois": `fillCadence` only decides *when* the Monday ritual proposes a
 * fill (weekly indicator every week, or the whole effective month in week
 * 1) — the budget itself is always a monthly figure, for both cadences.
 * Takes `_cadence` so a caller cannot silently bring back a cadence-dependent
 * suffix without touching this function.
 */
export function monthlyBudgetSuffix(cadence: FillCadence): "/mois" {
  void cadence;
  return "/mois";
}

/**
 * The per-week euro amount for a monthly budget, rounded to cents.
 * This is the single rounding policy for the weekly indicator across the app.
 */
export function computeWeeklyIndicator(monthlyBudget: number): number {
  return roundToCents(monthlyBudget * WEEKS_PER_MONTH);
}

/**
 * Monthly contribution needed to reach a goal by its target date, rounded to cents.
 * Returns null when there is no target date or the target month has already passed.
 *
 * monthsRemaining is inclusive of the target month (the +1), matching the previous
 * inline implementations in the envelope queries.
 */
export function computeGoalContribution(
  targetAmount: number,
  balance: number,
  targetDate: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate);
  const monthsRemaining =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth()) +
    1;
  if (monthsRemaining <= 0) return null;
  const remaining = targetAmount - balance;
  return roundToCents(remaining / monthsRemaining);
}
