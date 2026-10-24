import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { getFinancialMonthBounds, getMondaysInFinancialMonth } from "./format";

describe("getFinancialMonthBounds — property tests", () => {
  it("start is always a Monday", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const { start } = getFinancialMonthBounds(new Date(year, month, 1));
          expect(start.getDay()).toBe(1); // Monday
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("end is always a Sunday", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const { end } = getFinancialMonthBounds(new Date(year, month, 1));
          expect(end.getDay()).toBe(0); // Sunday
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("start is strictly before end", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const { start, end } = getFinancialMonthBounds(new Date(year, month, 1));
          expect(start.getTime()).toBeLessThan(end.getTime());
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("end - start spans exactly N whole weeks (Mon 00:00 to Sun 23:59:59.999)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const { start, end } = getFinancialMonthBounds(new Date(year, month, 1));
          // end is Sun 23:59:59.999, start is Mon 00:00:00.000
          // span in ms ≈ N*7*86400000; rounded to nearest day = N*7 days
          const days = Math.round(
            (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
          );
          // Duration rounds to N*7 days
          expect(days % 7).toBe(0);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("start falls within the calendar month", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const { start } = getFinancialMonthBounds(new Date(year, month, 1));
          expect(start.getMonth()).toBe(month);
          expect(start.getFullYear()).toBe(year);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("getMondaysInFinancialMonth — property tests", () => {
  it("always returns 4 or 5", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const mondays = getMondaysInFinancialMonth(new Date(year, month, 1));
          expect(mondays).toBeGreaterThanOrEqual(4);
          expect(mondays).toBeLessThanOrEqual(5);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("equals the number of weeks in the financial month span (Mon–Sun inclusive)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const mondays = getMondaysInFinancialMonth(new Date(year, month, 1));
          const { start, end } = getFinancialMonthBounds(new Date(year, month, 1));
          // end is Sun 23:59:59.999; whole weeks = round((end - start) / 7days)
          const weeksFromMs = Math.round(
            (end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000),
          );
          expect(mondays).toBe(weeksFromMs);
        },
      ),
      { numRuns: 1000 },
    );
  });

  // Property: consecutive months are contiguous (no dead zone)
  it("consecutive months are contiguous: nextStart - thisEnd === 1 ms", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2034 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const { end: thisEnd } = getFinancialMonthBounds(new Date(year, month, 1));
          const { start: nextStart } = getFinancialMonthBounds(new Date(year, month + 1, 1));
          expect(nextStart.getTime() - thisEnd.getTime()).toBe(1);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
