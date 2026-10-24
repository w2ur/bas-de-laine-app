/**
 * Pure guards for the `fillWeek` Server Action, extracted so they can be
 * tested without a database (same convention as transfer-logic.ts).
 */

import { roundToCents, isZeroAmount, amountsEqual } from "@/lib/money";

/**
 * Invariant this relies on: `date` is a UTC-midnight calendar date (parsed by
 * `calendarDate`, e.g. `new Date("2026-09-07")`), while `monthBounds` (from
 * `getFinancialMonthBounds()`) is built from *local* midnight / local
 * end-of-day. Paris is east of UTC, so a UTC-midnight date always falls on or
 * after the local midnight of the same calendar day, and `monthBounds.end`
 * stays end-of-day — so a plain Date comparison here classifies the target
 * date correctly regardless of which of the two midnight conventions
 * produced each side. Same invariant as `sumFillsInWindow` in week-logic.ts.
 */
export function validateFillWeekTarget(input: {
  date: Date;
  today: Date;
  monthBounds: { start: Date; end: Date };
  /** week.monday for the current financial week, server-derived from `today`
   * (see getFinancialWeek). Local midnight, same convention as monthBounds. */
  currentMonday: Date;
}): string | null {
  if (input.date > input.today) return "La date ne peut pas être dans le futur";
  if (input.date < input.monthBounds.start || input.date > input.monthBounds.end) {
    return "La date doit être dans le mois en cours";
  }
  // Defense in depth: the client is expected to submit the week's Monday
  // (server-derived, see getFillPlan's mondayDate), but a tampered or buggy
  // caller should not be able to write a fill dated any other weekday.
  // `date` is UTC-midnight (calendarDate), so its UTC day is the calendar weekday.
  if (input.date.getUTCDay() !== 1) return "La date doit être un lundi";
  // Regression: bc23cfb (related case) — any past Monday of
  // the current financial month used to pass every check above, not only
  // the current week's Monday. A sheet opened Sunday and confirmed after
  // midnight could then date its fills the previous week (which may already
  // be filled), leaving the actual current week still marked unfilled.
  // `date` is UTC-midnight, `currentMonday` is local midnight — compared by
  // calendar y/m/d, same invariant as the rest of this function.
  if (
    input.date.getUTCFullYear() !== input.currentMonday.getFullYear() ||
    input.date.getUTCMonth() !== input.currentMonday.getMonth() ||
    input.date.getUTCDate() !== input.currentMonday.getDate()
  ) {
    return "La date doit être le lundi de la semaine en cours";
  }
  return null;
}

/**
 * `validateFillWeekTarget` as the Server Action reports it. Every rejection
 * here means the client's plan is not this week's (a sheet left open from
 * last week, or confirmed just after midnight on Monday): `mondayDate` is
 * server-derived, so a legitimate client can only fail these checks by
 * holding an old plan. `stale: true` tells the sheet to close and refresh
 * the plan instead of toasting an error that recurs on every reopen.
 */
export function fillWeekDateRejection(
  input: Parameters<typeof validateFillWeekTarget>[0]
): { error: string; stale: true } | null {
  const error = validateFillWeekTarget(input);
  return error === null ? null : { error, stale: true };
}

/**
 * Returns the first envelopeId that is not an active BUDGET envelope owned by
 * the household, or null when every fill is legitimate.
 */
export function findForeignOrInvalidEnvelope(
  fills: { envelopeId: string }[],
  owned: { id: string; type: "BUDGET" | "GOAL"; isArchived: boolean }[]
): string | null {
  const ok = new Set(owned.filter((e) => e.type === "BUDGET" && !e.isArchived).map((e) => e.id));
  for (const f of fills) {
    if (!ok.has(f.envelopeId)) return f.envelopeId;
  }
  return null;
}

/**
 * Rounds every fill's amount to cents and rejects the whole batch if
 * rounding collapses any amount to (near) zero.
 *
 * `fillWeekSchema` only checks `positive().max(...)`, with no cent-precision
 * check, so a caller other than the sheet (which always sends cents/100)
 * could post a sub-cent amount. Contract: stored results always go through
 * `roundToCents` — this is the one place that
 * happens for `fillWeek`, and turning a round-to-zero into a rejection
 * (rather than a silently written 0.00 FILL) preserves the schema's own
 * positive-amount rule instead of letting rounding quietly defeat it.
 */
export function roundFillAmountsOrReject(
  fills: { envelopeId: string; amount: number }[]
): { fills: { envelopeId: string; amount: number }[] } | { error: string } {
  const rounded = fills.map((f) => ({ ...f, amount: roundToCents(f.amount) }));
  if (rounded.some((f) => isZeroAmount(f.amount))) {
    return { error: "Montant invalide" };
  }
  return { fills: rounded };
}

/**
 * Splits `fills` into the ones the write transaction should actually insert
 * and a count of how many were dropped as stale.
 *
 * The idempotency key is "the state the client saw" (`expectedFilledAmount`,
 * the row's `filledAmount` from the plan the sheet rendered), not a boolean
 * "any fill exists" check. For each fill, the current sum of existing FILLs
 * inside the envelope's own cadence window (the week for WEEKLY, the
 * financial month for MONTHLY) is compared against `expectedFilledAmount`
 * via `amountsEqual`. A match means nothing changed since the client last
 * saw this envelope, so the fill (a fresh fill, or a top-up) is written. A
 * mismatch means a concurrent write already changed it, so it is dropped.
 *
 * Regression: 7492dbc (Important). The previous guard
 * (`findAlreadyFilledEnvelopeIds`) dropped *every* envelope with any FILL in
 * its window — a boolean "already filled" check — so a top-up (a partial
 * fill plus its remainder, which F3's `filterPendingFillRows` makes
 * reachable in the ritual) could never be written: the action still
 * returned `{}` and the client toasted "Semaine remplie" while silently
 * discarding the write. Comparing the current sum against what the client
 * expected fixes this while still catching a stale resubmission (a second
 * tab, or a PWA restored from bfcache): its `expectedFilledAmount` no longer
 * matches once the first submission has landed.
 *
 * The caller must re-query `existingFillsById` fresh inside the write
 * transaction so a fill created by a concurrent request is seen.
 */
export function partitionFillsByExpectedState(
  fills: { envelopeId: string; amount: number; expectedFilledAmount: number }[],
  cadenceById: Map<string, "WEEKLY" | "MONTHLY">,
  existingFillsById: Map<string, { date: Date; amount: number }[]>,
  week: { monday: Date; sunday: Date },
  monthBounds: { start: Date; end: Date }
): { toInsert: { envelopeId: string; amount: number }[]; droppedCount: number } {
  const toInsert: { envelopeId: string; amount: number }[] = [];
  let droppedCount = 0;

  for (const f of fills) {
    const cadence = cadenceById.get(f.envelopeId);
    const [start, end] = cadence === "MONTHLY" ? [monthBounds.start, monthBounds.end] : [week.monday, week.sunday];
    const existing = existingFillsById.get(f.envelopeId) ?? [];
    const currentSum = roundToCents(
      existing.filter((e) => e.date >= start && e.date <= end).reduce((sum, e) => sum + e.amount, 0)
    );

    if (amountsEqual(currentSum, f.expectedFilledAmount)) {
      toInsert.push({ envelopeId: f.envelopeId, amount: f.amount });
    } else {
      droppedCount++;
    }
  }

  return { toInsert, droppedCount };
}
