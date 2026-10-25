import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildDemoData, DEMO_HISTORY_WEEKS } from "./seed-demo";
import { DEMO_HOUSEHOLD_ID, DEMO_USER } from "../src/lib/demo/mode";
import { computeEnvelopeBalance } from "../src/lib/envelope-balance";
import { getMondaysInFinancialMonth } from "../src/lib/format";
import { amountsEqual, roundToCents } from "../src/lib/money";
import { computeWeeklyIndicator } from "../src/lib/budget-math";

const DAY_MS = 86_400_000;
const today = new Date(Date.UTC(2026, 9, 25)); // a Sunday

/** Any calendar day over a few decades, as UTC midnight. */
const anyDay = fc
  .integer({ min: Date.UTC(2000, 0, 1) / DAY_MS, max: Date.UTC(2060, 0, 1) / DAY_MS })
  .map((days) => new Date(days * DAY_MS));

/** A visitor may well see one envelope slightly overspent; never a deep hole. */
const NEGATIVE_TOLERANCE = 25;

const isCents = (value: unknown) => Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 1e-6;

describe("buildDemoData", () => {
  it("is deterministic for a given day", () => {
    expect(buildDemoData(today)).toEqual(buildDemoData(new Date(Date.UTC(2026, 9, 25, 17, 30))));
  });

  it("belongs entirely to the fixed demo household and user", () => {
    const data = buildDemoData(today);
    expect(data.household.id).toBe(DEMO_HOUSEHOLD_ID);
    expect(data.user).toMatchObject({ ...DEMO_USER, householdId: DEMO_HOUSEHOLD_ID });
    for (const rows of [data.envelopes, data.recurringCharges]) {
      for (const row of rows) expect(row.householdId).toBe(DEMO_HOUSEHOLD_ID);
    }
    expect(data.treasury.householdId).toBe(DEMO_HOUSEHOLD_ID);
  });

  it("covers about three months, ending no later than today", () => {
    const dates = buildDemoData(today).transactions.map((t) => (t.date as Date).getTime());
    const spanDays = (Math.max(...dates) - Math.min(...dates)) / DAY_MS;
    expect(spanDays).toBeGreaterThanOrEqual(7 * DEMO_HISTORY_WEEKS - 7);
    expect(Math.max(...dates)).toBeLessThanOrEqual(today.getTime());
  });

  it("leaves the current week unfilled for the Monday ritual", () => {
    const monday = Date.UTC(2026, 9, 19);
    const fillsThisWeek = buildDemoData(today).transactions.filter(
      (t) => t.type === "FILL" && (t.date as Date).getTime() >= monday,
    );
    expect(fillsThisWeek).toEqual([]);
  });

  it("links the transfer legs to each other, with equal amounts", () => {
    const data = buildDemoData(today);
    const [a, b] = data.transferLinks;
    expect(a).toEqual({ id: b.linkedTransactionId, linkedTransactionId: b.id });
    const legs = data.transactions.filter((t) => t.id === a.id || t.id === b.id);
    expect(legs.map((t) => t.type).sort()).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);
    expect(legs[0].amount).toBe(legs[1].amount);
  });

  // Regression: the budgets totalled 1 490 € against a 2 925,64 € pool, so every
  // visitor's Configuration opened on the mismatch warning.
  it("shares out exactly the pool: active budgets sum to income minus active charges", () => {
    const data = buildDemoData(today);
    const charges = data.recurringCharges.filter((c) => c.active).reduce((sum, c) => sum + Number(c.amount), 0);
    const budgets = data.envelopes
      .filter((e) => e.type === "BUDGET" && !e.isArchived)
      .reduce((sum, e) => sum + Number(e.monthlyBudget), 0);
    expect(amountsEqual(budgets, Number(data.household.income) - charges)).toBe(true);
  });

  it("matches the treasury balance to its pools, as a refresh would", () => {
    const data = buildDemoData(today);
    const pools = data.pools.reduce((sum, pool) => sum + Number(pool.amount), 0);
    expect(Number(data.treasury.balance)).toBeCloseTo(pools, 2);
  });

  it("keeps every envelope balance plausible: none far below zero, goals under target", () => {
    const data = buildDemoData(today);
    for (const envelope of data.envelopes) {
      const own = data.transactions.filter((t) => t.envelopeId === envelope.id) as { amount: number; type: "FILL" }[];
      const balance = computeEnvelopeBalance(own);
      if (envelope.type === "GOAL") {
        expect(balance).toBeGreaterThan(0);
        expect(balance).toBeLessThan(Number(envelope.targetAmount));
      } else {
        expect(balance).toBeGreaterThan(-Number(envelope.monthlyBudget));
      }
    }
  });

  // Regression: the window opens mid-month, and MONTHLY envelopes used to wait for the
  // next month's first Monday, leaving their first weeks unfunded.
  // Regression: weekly fills were monthlyBudget / Mondays (180 € for a 720 € budget in
  // a 4-week month), not the 166,15 € indicator the ritual proposes and the row shows.
  it("fills WEEKLY envelopes with the app's weekly indicator", () => {
    const data = buildDemoData(today);
    for (const envelope of data.envelopes.filter((e) => e.fillCadence === "WEEKLY" && e.type === "BUDGET")) {
      const fills = data.transactions.filter((t) => t.envelopeId === envelope.id && t.type === "FILL");
      expect(fills.length).toBe(DEMO_HISTORY_WEEKS);
      for (const fill of fills) expect(fill.amount).toBe(computeWeeklyIndicator(Number(envelope.monthlyBudget)));
    }
  });

  it("funds every MONTHLY envelope from the first week of the window", () => {
    const data = buildDemoData(today);
    const firstMonday = Date.UTC(2026, 6, 20); // mid-July: not a month's first Monday
    for (const envelope of data.envelopes.filter((e) => e.fillCadence === "MONTHLY")) {
      const fills = data.transactions.filter((t) => t.envelopeId === envelope.id && t.type === "FILL");
      expect(fills.some((t) => (t.date as Date).getTime() === firstMonday)).toBe(true);
    }
  });

  it("for any day: the window's first MONTHLY fill is the app's effective month, prorated by the weeks it covers", () => {
    fc.assert(
      fc.property(anyDay, (day) => {
        const data = buildDemoData(day);
        const currentMonday = day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS;
        const firstMonday = new Date(currentMonday - 7 * DEMO_HISTORY_WEEKS * DAY_MS);
        const month = firstMonday.getUTCMonth();
        // Counted independently: the Mondays from the window's first one to the month's end.
        let weeksLeft = 0;
        for (let d = firstMonday.getTime(); new Date(d).getUTCMonth() === month; d += 7 * DAY_MS) weeksLeft++;
        return data.envelopes
          .filter((e) => e.fillCadence === "MONTHLY")
          .every((envelope) => {
            const first = data.transactions.find(
              (t) => t.envelopeId === envelope.id && t.type === "FILL" && (t.date as Date).getTime() === firstMonday.getTime(),
            );
            // The app's amount: the weekly indicator times the weeks (effectiveMonthlyBudget
            // is indicator × Mondays), never monthlyBudget / Mondays.
            const expected = roundToCents(computeWeeklyIndicator(Number(envelope.monthlyBudget)) * weeksLeft);
            return first !== undefined && Number(first.amount) === expected;
          });
      }),
      { numRuns: 100 },
    );
  });

  it("for any day: unique ids, positive cent amounts, nothing after the day, every row on a known envelope", () => {
    fc.assert(
      fc.property(anyDay, (day) => {
        const data = buildDemoData(day);
        const envelopeIds = new Set(data.envelopes.map((e) => e.id));
        const ids = data.transactions.map((t) => t.id);
        return (
          new Set(ids).size === ids.length &&
          data.transactions.every(
            (t) =>
              Number(t.amount) > 0 &&
              isCents(t.amount) &&
              (t.date as Date).getTime() <= day.getTime() &&
              envelopeIds.has(t.envelopeId),
          )
        );
      }),
      { numRuns: 100 },
    );
  });

  // Regression: balances used to run at 2–3× their reference, so 7 of 8 bars were
  // full and the overspent state never showed.
  it("for any day: every balance sits at 30–110 % of its reference, but exactly one slightly overspent", () => {
    fc.assert(
      fc.property(anyDay, (day) => {
        const data = buildDemoData(day);
        const currentMonday = day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS;
        const monday = new Date(currentMonday);
        const mondays = getMondaysInFinancialMonth(new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), 15)));
        const shares = data.envelopes
          .filter((e) => e.type === "BUDGET")
          .map((envelope) => {
            const own = data.transactions.filter((t) => t.envelopeId === envelope.id) as { amount: number; type: "FILL" }[];
            const weekly = computeWeeklyIndicator(Number(envelope.monthlyBudget));
            const reference = envelope.fillCadence === "MONTHLY" ? weekly * mondays : weekly;
            return computeEnvelopeBalance(own) / reference;
          });
        const overspent = shares.filter((share) => share < 0);
        return (
          overspent.length === 1 &&
          overspent[0] >= -0.35 &&
          shares.filter((share) => share >= 0).every((share) => share >= 0.3 && share <= 1.1)
        );
      }),
      { numRuns: 100 },
    );
  });

  it("for any day: no envelope ends below a small negative balance", () => {
    fc.assert(
      fc.property(anyDay, (day) => {
        const data = buildDemoData(day);
        return data.envelopes.every((envelope) => {
          const own = data.transactions.filter((t) => t.envelopeId === envelope.id) as { amount: number; type: "FILL" }[];
          return computeEnvelopeBalance(own) >= -NEGATIVE_TOLERANCE;
        });
      }),
      { numRuns: 100 },
    );
  });
});
