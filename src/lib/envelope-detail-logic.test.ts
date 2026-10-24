import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { weekRowDisplay } from "./envelope-detail-logic";

describe("weekRowDisplay", () => {
  // Regression: 9aef0df — a MONTHLY envelope filled 100 € in week 1 and spent 40 €
  // that week; the detail page flagged it red against a 25 € weekly share.
  it("never flags a MONTHLY week as overspent, and shows no quota", () => {
    expect(weekRowDisplay({ spent: 40, budget: 25, cadence: "MONTHLY" })).toEqual({
      showQuota: false,
      over: false,
      percent: 0,
    });
  });

  it("flags a WEEKLY week whose spending exceeds the share", () => {
    const row = weekRowDisplay({ spent: 40, budget: 25, cadence: "WEEKLY" });
    expect(row.showQuota).toBe(true);
    expect(row.over).toBe(true);
    expect(row.percent).toBe(100);
  });

  it("does not flag a WEEKLY week spent exactly to the share, float noise included", () => {
    const row = weekRowDisplay({ spent: 0.1 + 0.2, budget: 0.3, cadence: "WEEKLY" });
    expect(row.over).toBe(false);
    expect(row.percent).toBeCloseTo(100, 6);
  });

  it("returns 0 percent for a zero or sub-cent weekly share", () => {
    expect(weekRowDisplay({ spent: 10, budget: 0, cadence: "WEEKLY" }).percent).toBe(0);
    expect(weekRowDisplay({ spent: 10, budget: 0.001, cadence: "WEEKLY" }).percent).toBe(0);
  });

  it("keeps the WEEKLY bar within [0, 100]", () => {
    const money = fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(money, money, (spent, budget) => {
        const { percent } = weekRowDisplay({ spent, budget, cadence: "WEEKLY" });
        return percent >= 0 && percent <= 100;
      }),
      { numRuns: 1000 },
    );
  });
});
