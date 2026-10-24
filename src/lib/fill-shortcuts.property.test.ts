import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeFillShortcuts } from "./fill-shortcuts";

const arbPositiveBudget = fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true });
const arbBalance = fc.double({ min: -10_000, max: 100_000, noNaN: true, noDefaultInfinity: true });
const arbFilled = fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true });
const arbMondays = fc.constantFrom(4, 5);

describe("computeFillShortcuts — property tests", () => {
  it("returns empty array when effectiveMonthlyBudget <= 0", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100_000, max: 0, noNaN: true, noDefaultInfinity: true }),
        arbBalance,
        arbFilled,
        (budget, balance, filled) => {
          const result = computeFillShortcuts({
            effectiveMonthlyBudget: budget,
            weeklyIndicator: 0,
            balance,
            filled,
          });
          expect(result).toHaveLength(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("all cents values are non-negative integers", () => {
    fc.assert(
      fc.property(arbPositiveBudget, arbBalance, arbFilled, arbMondays, (budget, balance, filled, mondays) => {
        const weeklyIndicator = (budget * 12) / 52;
        const effectiveMonthlyBudget = weeklyIndicator * mondays;
        const shortcuts = computeFillShortcuts({ effectiveMonthlyBudget, weeklyIndicator, balance, filled });
        for (const s of shortcuts) {
          expect(s.cents).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(s.cents)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("returns between 2 and 4 shortcuts for positive budgets", () => {
    fc.assert(
      fc.property(arbPositiveBudget, arbBalance, arbFilled, arbMondays, (budget, balance, filled, mondays) => {
        const weeklyIndicator = (budget * 12) / 52;
        const effectiveMonthlyBudget = weeklyIndicator * mondays;
        const shortcuts = computeFillShortcuts({ effectiveMonthlyBudget, weeklyIndicator, balance, filled });
        expect(shortcuts.length).toBeGreaterThanOrEqual(2);
        expect(shortcuts.length).toBeLessThanOrEqual(4);
      }),
      { numRuns: 1000 },
    );
  });

  it("never returns NaN or Infinity in cents", () => {
    fc.assert(
      fc.property(arbPositiveBudget, arbBalance, arbFilled, arbMondays, (budget, balance, filled, mondays) => {
        const weeklyIndicator = (budget * 12) / 52;
        const effectiveMonthlyBudget = weeklyIndicator * mondays;
        const shortcuts = computeFillShortcuts({ effectiveMonthlyBudget, weeklyIndicator, balance, filled });
        for (const s of shortcuts) {
          expect(Number.isFinite(s.cents)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
