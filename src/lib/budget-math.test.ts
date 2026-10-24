import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeWeeklyIndicator, computeGoalContribution, monthlyBudgetSuffix } from "./budget-math";

describe("computeWeeklyIndicator", () => {
  it("spreads a monthly budget over 52 weeks", () => {
    // 520 * 12 / 52 = 120 exactly
    expect(computeWeeklyIndicator(520)).toBe(120);
  });

  it("rounds to cents", () => {
    // 600 * 12 / 52 = 138.4615... → 138.46
    expect(computeWeeklyIndicator(600)).toBe(138.46);
  });

  it("returns 0 for a 0 budget", () => {
    expect(computeWeeklyIndicator(0)).toBe(0);
  });

  it("stays within half a cent of the exact value (single rounding policy)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (cents) => {
        const monthlyBudget = cents / 100;
        const result = computeWeeklyIndicator(monthlyBudget);
        expect(Math.abs(result - (monthlyBudget * 12) / 52)).toBeLessThanOrEqual(0.005);
      }),
      { numRuns: 1000 }
    );
  });
});

describe("monthlyBudgetSuffix", () => {
  // Regression: 87b26a6 — the configuration screen showed the
  // monthly budget figure (`Number(env.monthlyBudget)`) with a suffix that
  // switched to "/sem" for WEEKLY envelopes, reading "600,00 € /sem" for a
  // 600 € monthly budget — about 4.33x too high for a weekly figure.
  // `fillCadence` only decides *when* the Monday ritual proposes a fill
  // (the weekly or monthly fill rhythm); the budget itself is always monthly, so its
  // display suffix must never vary by cadence.
  it("is always /mois, regardless of fill cadence", () => {
    expect(monthlyBudgetSuffix("WEEKLY")).toBe("/mois");
    expect(monthlyBudgetSuffix("MONTHLY")).toBe("/mois");
  });
});

describe("computeGoalContribution", () => {
  const now = new Date(2026, 0, 15); // 15 January 2026

  it("returns null when there is no target date", () => {
    expect(computeGoalContribution(1000, 200, null, now)).toBeNull();
    expect(computeGoalContribution(1000, 200, undefined, now)).toBeNull();
  });

  it("returns null when the target month has already passed", () => {
    // December 2025 is before January 2026
    expect(computeGoalContribution(1000, 200, new Date(2025, 11, 1), now)).toBeNull();
  });

  it("counts the target month inclusively (+1) and rounds to cents", () => {
    // March 2026: monthsRemaining = (2-0) + 1 = 3; remaining = 1000 → 333.33
    const result = computeGoalContribution(1200, 200, new Date(2026, 2, 20), now);
    expect(result).toBe(333.33);
  });

  it("treats the current month as one remaining month", () => {
    // Still January → monthsRemaining = 1 → full remaining due now
    const result = computeGoalContribution(500, 100, new Date(2026, 0, 31), now);
    expect(result).toBe(400);
  });

  it("conservation: contribution × monthsRemaining recovers the remaining (within rounding)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 36 }),
        (targetCents, balanceCents, monthsAhead) => {
          const targetAmount = targetCents / 100;
          const balance = balanceCents / 100;
          const targetDate = new Date(2026, monthsAhead - 1, 15); // monthsRemaining = monthsAhead
          const contribution = computeGoalContribution(targetAmount, balance, targetDate, now);
          expect(contribution).not.toBeNull();
          const remaining = targetAmount - balance;
          // Each month is rounded to cents (±0.005); float dust adds a sub-µ margin.
          expect(Math.abs((contribution as number) * monthsAhead - remaining)).toBeLessThanOrEqual(
            0.005 * monthsAhead + 1e-6
          );
        }
      ),
      { numRuns: 1000 }
    );
  });
});
