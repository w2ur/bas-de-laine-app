import { describe, it, expect } from "vitest";
import { getFinancialWeek, formatWeekLabel, computeFillPlan, filterPendingFillRows, type FillPlanEnvelope } from "./week-logic";
import { getFinancialMonthBounds } from "./format";

// September 2026: 1st is a Tuesday → financial month starts Monday 7 Sept, 4 weeks (7, 14, 21, 28).
const SEPT = new Date(2026, 8, 1);
// June 2026: 1st is a Monday, last day (30th) is a Tuesday → 5 Mondays (1, 8, 15, 22, 29).
const JUNE = new Date(2026, 5, 1);
// November 2026: 1st is a Sunday → financial month starts Monday 2 Nov.
const NOV = new Date(2026, 10, 1);

describe("getFinancialWeek", () => {
  it("returns week 1 on the first Monday", () => {
    const w = getFinancialWeek(SEPT, new Date(2026, 8, 7));
    expect(w.index).toBe(1);
    expect(w.count).toBe(4);
    expect(w.monday.getDate()).toBe(7);
    expect(w.sunday.getDate()).toBe(13);
  });

  it("returns week 2 on the second Sunday (last day of the week)", () => {
    const w = getFinancialWeek(SEPT, new Date(2026, 8, 20, 23, 59));
    expect(w.index).toBe(2);
    expect(w.monday.getDate()).toBe(14);
    expect(w.sunday.getDate()).toBe(20);
  });

  it("counts 5 weeks in June 2026 and reports the last week spilling into July", () => {
    const w = getFinancialWeek(JUNE, new Date(2026, 6, 3)); // Friday 3 July belongs to the week of Monday 29 June
    expect(w.count).toBe(5);
    expect(w.index).toBe(5);
    expect(w.monday.getMonth()).toBe(5);
    expect(w.sunday.getMonth()).toBe(6);
    expect(w.sunday.getDate()).toBe(5);
  });

  it("handles a month whose 1st is a Sunday", () => {
    const w = getFinancialWeek(NOV, new Date(2026, 10, 2));
    expect(w.index).toBe(1);
    expect(w.monday.getDate()).toBe(2);
  });

  it("clamps a day before the financial start to week 1", () => {
    const w = getFinancialWeek(SEPT, new Date(2026, 8, 1));
    expect(w.index).toBe(1);
  });

  it("clamps a day after the financial end to the last week", () => {
    const w = getFinancialWeek(SEPT, new Date(2026, 9, 6));
    expect(w.index).toBe(4);
  });

  // Regression: 2af12d1 — a raw local-ms week index misindexed days after the spring-forward
  // transition: 27 March 2028 is week 4 of financial March 2028, not week 3.
  it("indexes correctly across the spring-forward DST transition", () => {
    const w = getFinancialWeek(new Date(2028, 2, 1), new Date(2028, 2, 27, 12));
    expect(w.index).toBe(4);
    expect(w.monday.getDate()).toBe(27);
  });
});

describe("formatWeekLabel", () => {
  it("formats a week inside one month", () => {
    const w = getFinancialWeek(SEPT, new Date(2026, 8, 21));
    expect(formatWeekLabel(w)).toBe("Semaine 3/4 · 21–27 sept.");
  });

  it("names both months when the week crosses a month boundary", () => {
    const w = getFinancialWeek(JUNE, new Date(2026, 5, 30));
    expect(formatWeekLabel(w)).toBe("Semaine 5/5 · 29 juin – 5 juil.");
  });
});

const bounds = getFinancialMonthBounds(SEPT);
const week1 = getFinancialWeek(SEPT, new Date(2026, 8, 7));
const week3 = getFinancialWeek(SEPT, new Date(2026, 8, 22));

function env(over: Partial<FillPlanEnvelope>): FillPlanEnvelope {
  return {
    id: "e1", name: "Courses", icon: null, color: null,
    fillCadence: "WEEKLY", weeklyIndicator: 138.46, effectiveMonthlyBudget: 553.84, fills: [],
    ...over,
  };
}

describe("computeFillPlan", () => {
  it("plans the weekly indicator for a WEEKLY envelope", () => {
    const [row] = computeFillPlan([env({})], week3, bounds);
    expect(row).toMatchObject({ cadence: "WEEKLY", amount: 138.46, alreadyFilled: false, filledAmount: 0, late: false });
  });

  it("flags a WEEKLY envelope already filled this week and sums the fills", () => {
    const [row] = computeFillPlan(
      [env({ fills: [{ date: new Date(2026, 8, 21), amount: 100 }, { date: new Date(2026, 8, 23), amount: 38.46 }] })],
      week3, bounds
    );
    expect(row.alreadyFilled).toBe(true);
    expect(row.filledAmount).toBeCloseTo(138.46, 6);
  });

  it("ignores a WEEKLY fill made in another week", () => {
    const [row] = computeFillPlan([env({ fills: [{ date: new Date(2026, 8, 14), amount: 138.46 }] })], week3, bounds);
    expect(row.alreadyFilled).toBe(false);
  });

  it("plans the effective month for a MONTHLY envelope in week 1", () => {
    const [row] = computeFillPlan([env({ fillCadence: "MONTHLY" })], week1, bounds);
    expect(row).toMatchObject({ cadence: "MONTHLY", amount: 553.84, alreadyFilled: false, late: false });
  });

  it("omits a MONTHLY envelope in week 3 when it was filled in week 1", () => {
    const rows = computeFillPlan(
      [env({ fillCadence: "MONTHLY", fills: [{ date: new Date(2026, 8, 7), amount: 553.84 }] })],
      week3, bounds
    );
    expect(rows).toHaveLength(0);
  });

  it("includes a never-filled MONTHLY envelope in week 3 flagged late", () => {
    const [row] = computeFillPlan([env({ fillCadence: "MONTHLY" })], week3, bounds);
    expect(row).toMatchObject({ amount: 553.84, alreadyFilled: false, late: true });
  });

  it("keeps a partially filled MONTHLY envelope in week 3, flagged alreadyFilled but not late", () => {
    const [row] = computeFillPlan(
      [env({ fillCadence: "MONTHLY", fills: [{ date: new Date(2026, 8, 7), amount: 100 }] })],
      week3, bounds
    );
    expect(row).toMatchObject({ amount: 553.84, alreadyFilled: true, filledAmount: 100, late: false });
  });

  it("omits a MONTHLY envelope in week 3 when fills cover the month across several transactions", () => {
    const rows = computeFillPlan(
      [env({ fillCadence: "MONTHLY", fills: [{ date: new Date(2026, 8, 7), amount: 500 }, { date: new Date(2026, 8, 15), amount: 53.84 }] })],
      week3, bounds
    );
    expect(rows).toHaveLength(0);
  });

  it("omits envelopes with no budget", () => {
    expect(computeFillPlan([env({ weeklyIndicator: 0, effectiveMonthlyBudget: 0 })], week1, bounds)).toHaveLength(0);
  });

  it("keeps input order", () => {
    const rows = computeFillPlan([env({ id: "b", name: "B" }), env({ id: "a", name: "A" })], week1, bounds);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("accepts ISO date strings for fills", () => {
    const [row] = computeFillPlan([env({ fills: [{ date: "2026-09-22", amount: 10 }] })], week3, bounds);
    expect(row.alreadyFilled).toBe(true);
  });

  it("counts a UTC-midnight fill dated this week's Monday", () => {
    const [row] = computeFillPlan([env({ fills: [{ date: new Date("2026-09-21T00:00:00Z"), amount: 10 }] })], week3, bounds);
    expect(row.alreadyFilled).toBe(true);
  });

  it("counts a UTC-midnight fill dated this week's Sunday", () => {
    const [row] = computeFillPlan([env({ fills: [{ date: new Date("2026-09-27T00:00:00Z"), amount: 10 }] })], week3, bounds);
    expect(row.alreadyFilled).toBe(true);
  });

  it("ignores a UTC-midnight fill dated next Monday", () => {
    const [row] = computeFillPlan([env({ fills: [{ date: new Date("2026-09-28T00:00:00Z"), amount: 10 }] })], week3, bounds);
    expect(row.alreadyFilled).toBe(false);
  });
});

describe("filterPendingFillRows", () => {
  // Regression: 7548493 — `alreadyFilled` only means "a FILL
  // exists in this window", not "the row is fully covered". The ritual used
  // to filter on `!r.alreadyFilled`, so a WEEKLY envelope topped up with a
  // smaller manual fill (through fillEnvelope) disappeared from the plan
  // entirely: the page said "Semaine remplie" and the remaining 118.46 € of
  // a 138.46 € weekly indicator was never proposed, with no way to reach it.
  it("keeps a WEEKLY row that is only partially filled", () => {
    const [row] = computeFillPlan(
      [env({ fills: [{ date: new Date(2026, 8, 21), amount: 20 }] })],
      week3,
      bounds
    );
    expect(row.alreadyFilled).toBe(true); // any fill in the window counts
    expect(filterPendingFillRows([row])).toHaveLength(1); // but a remainder is still owed
  });

  it("drops a row fully covered by its fills", () => {
    const [row] = computeFillPlan(
      [env({ fills: [{ date: new Date(2026, 8, 21), amount: 138.46 }] })],
      week3,
      bounds
    );
    expect(filterPendingFillRows([row])).toHaveLength(0);
  });

  it("keeps a never-filled row", () => {
    const [row] = computeFillPlan([env({})], week3, bounds);
    expect(filterPendingFillRows([row])).toHaveLength(1);
  });
});
