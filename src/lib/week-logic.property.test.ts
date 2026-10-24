import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { getFinancialWeek, computeFillPlan } from "./week-logic";
import { getFinancialMonthBounds, getMondaysInFinancialMonth } from "./format";
import { computeWeeklyIndicator } from "./budget-math";

const arbMonth = fc
  .record({ y: fc.integer({ min: 2024, max: 2032 }), m: fc.integer({ min: 0, max: 11 }) })
  .map(({ y, m }) => new Date(y, m, 1));

describe("getFinancialWeek properties", () => {
  it("index is within [1, count] and the day lies inside [monday, sunday] for every day of the financial month", () => {
    fc.assert(
      fc.property(arbMonth, fc.integer({ min: 0, max: 34 }), (month, offset) => {
        const { start, end } = getFinancialMonthBounds(month);
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12);
        fc.pre(day <= end);
        const w = getFinancialWeek(month, day);
        expect(w.count).toBe(getMondaysInFinancialMonth(month));
        expect(w.index).toBeGreaterThanOrEqual(1);
        expect(w.index).toBeLessThanOrEqual(w.count);
        expect(day >= w.monday).toBe(true);
        expect(day <= w.sunday).toBe(true);
        expect(w.monday.getDay()).toBe(1);
        expect(w.sunday.getDay()).toBe(0);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("computeFillPlan properties", () => {
  it("a WEEKLY envelope filled every week receives exactly its effective monthly budget", () => {
    fc.assert(
      fc.property(arbMonth, fc.integer({ min: 100, max: 1_000_000 }), (month, budgetCents) => {
        const monthlyBudget = budgetCents / 100;
        const weeklyIndicator = computeWeeklyIndicator(monthlyBudget);
        const count = getMondaysInFinancialMonth(month);
        const effectiveMonthlyBudget = weeklyIndicator * count;
        const bounds = getFinancialMonthBounds(month);
        let total = 0;
        for (let i = 0; i < count; i++) {
          const day = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), bounds.start.getDate() + i * 7, 12);
          const week = getFinancialWeek(month, day);
          const rows = computeFillPlan(
            [{ id: "e", name: "E", icon: null, color: null, fillCadence: "WEEKLY", weeklyIndicator, effectiveMonthlyBudget, fills: [] }],
            week, bounds
          );
          expect(rows).toHaveLength(1);
          const [row] = rows;
          total += row.amount;
        }
        expect(Math.abs(total - effectiveMonthlyBudget)).toBeLessThan(1e-6);
      }),
      { numRuns: 1000 }
    );
  });
});
