import { describe, it, expect, vi } from "vitest";
import {
  formatCurrency,
  formatInstantShort,
  formatPercent,
  formatDayShort,
  formatWeekSpan,
  capitalizeFirst,
  getFinancialMonthBounds,
  getMondaysInFinancialMonth,
  getFinancialMonthKey,
  getCurrentFinancialMonth,
  todayInParisDate,
} from "./format";
import { parsePastedAmount } from "@/hooks/use-cents-input";

describe("formatCurrency", () => {
  it("formats a positive number as EUR", () => {
    const result = formatCurrency(1234.56);
    // fr-FR uses non-breaking space as thousands separator
    expect(result).toContain("1");
    expect(result).toContain("234");
    expect(result).toContain("€");
  });

  // Regression: the U+202F thousands separator renders at near-zero width in
  // Instrument Serif, so « 1 310,01 € » read « 1310,01 € » in every figure.
  it("groups thousands with U+00A0, never U+202F", () => {
    expect(formatCurrency(1234.5)).toBe("1\u00A0234,50\u00A0€");
    expect(formatCurrency(-1234567.891)).toBe("-1\u00A0234\u00A0567,89\u00A0€");
    expect(formatCurrency(1234.5)).not.toContain("\u202F");
  });

  it("still pastes back into a money field as the same amount", () => {
    expect(parsePastedAmount(formatCurrency(1234.5))).toBe(123450);
    expect(parsePastedAmount(formatCurrency(1500))).toBe(150000);
    expect(parsePastedAmount(formatCurrency(98765.43))).toBe(9876543);
  });

  it("formats zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
    expect(result).toContain("€");
  });

  it("formats a negative number", () => {
    const result = formatCurrency(-50);
    expect(result).toContain("50");
    expect(result).toContain("€");
  });

  it("accepts a string input", () => {
    const result = formatCurrency("99.99");
    expect(result).toContain("99");
    expect(result).toContain("€");
  });

  it("accepts a Decimal-like object with toString()", () => {
    const decimal = { toString: () => "42.50" };
    const result = formatCurrency(decimal);
    expect(result).toContain("42");
    expect(result).toContain("€");
  });
});

describe("getFinancialMonthBounds", () => {
  it("returns correct bounds for February 2026", () => {
    const feb2026 = new Date(2026, 1, 1); // Feb 1 is a Sunday
    const { start, end } = getFinancialMonthBounds(feb2026);

    // First Monday in Feb 2026 = Feb 2
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(1); // February
    expect(start.getDate()).toBe(2);
    expect(start.getDay()).toBe(1); // Monday

    // Last Monday in Feb 2026: Feb 23 (Mon)
    // End = Feb 23 + 6 = Mar 1 (Sun) at 23:59:59.999
    expect(end.getDay()).toBe(0); // Sunday
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(2); // March
    expect(end.getDate()).toBe(1);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("returns correct bounds for January 2026", () => {
    const jan2026 = new Date(2026, 0, 1); // Jan 1 is a Thursday
    const { start, end } = getFinancialMonthBounds(jan2026);

    // First Monday in Jan 2026 = Jan 5
    expect(start.getDate()).toBe(5);
    expect(start.getDay()).toBe(1); // Monday

    // Last Monday in Jan 2026 = Jan 26
    // End = Jan 26 + 6 = Feb 1 (Sun)
    expect(end.getDay()).toBe(0); // Sunday
  });

  it("start is always a Monday", () => {
    for (let m = 0; m < 12; m++) {
      const { start } = getFinancialMonthBounds(new Date(2026, m, 1));
      expect(start.getDay()).toBe(1); // Monday
    }
  });

  it("end is always a Sunday", () => {
    for (let m = 0; m < 12; m++) {
      const { end } = getFinancialMonthBounds(new Date(2026, m, 1));
      expect(end.getDay()).toBe(0); // Sunday
    }
  });

  it("start is always before or equal to end", () => {
    for (let m = 0; m < 12; m++) {
      const { start, end } = getFinancialMonthBounds(new Date(2026, m, 1));
      expect(start.getTime()).toBeLessThan(end.getTime());
    }
  });

  it("handles month where 1st is a Monday", () => {
    // June 2026: June 1 is a Monday
    const june2026 = new Date(2026, 5, 1);
    const { start } = getFinancialMonthBounds(june2026);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(5);
  });
});

describe("getMondaysInFinancialMonth", () => {
  it("returns 4 for February 2026 (4 Mondays)", () => {
    expect(getMondaysInFinancialMonth(new Date(2026, 1, 1))).toBe(4);
  });

  it("returns 5 for March 2026 (5 Mondays)", () => {
    expect(getMondaysInFinancialMonth(new Date(2026, 2, 1))).toBe(5);
  });

  it("returns 4 or 5 for every month", () => {
    for (let y = 2024; y <= 2028; y++) {
      for (let m = 0; m < 12; m++) {
        const mondays = getMondaysInFinancialMonth(new Date(y, m, 1));
        expect(mondays).toBeGreaterThanOrEqual(4);
        expect(mondays).toBeLessThanOrEqual(5);
      }
    }
  });

  it("sums to 52 or 53 over a full year", () => {
    for (let y = 2024; y <= 2028; y++) {
      let total = 0;
      for (let m = 0; m < 12; m++) {
        total += getMondaysInFinancialMonth(new Date(y, m, 1));
      }
      expect(total).toBeGreaterThanOrEqual(52);
      expect(total).toBeLessThanOrEqual(53);
    }
  });
});

describe("getFinancialMonthKey", () => {
  it("formats January 2026 as 2026-01", () => {
    expect(getFinancialMonthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("formats December 2025 as 2025-12", () => {
    expect(getFinancialMonthKey(new Date(2025, 11, 1))).toBe("2025-12");
  });

  it("pads single-digit months", () => {
    expect(getFinancialMonthKey(new Date(2026, 2, 1))).toBe("2026-03");
  });
});

describe("getCurrentFinancialMonth", () => {
  it("returns a Date representing the first of a month", () => {
    const result = getCurrentFinancialMonth();
    expect(result.getDate()).toBe(1);
  });

  it("returns a valid month (0-11)", () => {
    const result = getCurrentFinancialMonth();
    expect(result.getMonth()).toBeGreaterThanOrEqual(0);
    expect(result.getMonth()).toBeLessThanOrEqual(11);
  });

  it("regression: derives 'now' from Paris time, not a server's raw UTC clock", () => {
    // Real instant: 2026-09-06T22:30:00Z (Sunday 22:30 UTC).
    // Paris (CEST, UTC+2) is already Monday 7 Sept 00:30 — the financial
    // month's start — while the UTC calendar date is still Sunday 6 Sept.
    // Before this fix, `now` came from a raw `new Date()`; on a server
    // running in UTC (Vercel's default), that read "today" as Sunday 6 Sept,
    // missed the financial start, and fell back to August.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T22:30:00.000Z"));

    try {
      const result = getCurrentFinancialMonth();
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(8); // September (0-indexed)
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("todayInParisDate", () => {
  it("returns a Date at UTC midnight", () => {
    const result = todayInParisDate();
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it("returns a valid calendar Date", () => {
    const result = todayInParisDate();
    expect(result instanceof Date).toBe(true);
    expect(isNaN(result.getTime())).toBe(false);
    expect(result.getUTCFullYear()).toBeGreaterThan(2020);
    expect(result.getUTCMonth()).toBeGreaterThanOrEqual(0);
    expect(result.getUTCMonth()).toBeLessThanOrEqual(11);
    expect(result.getUTCDate()).toBeGreaterThanOrEqual(1);
    expect(result.getUTCDate()).toBeLessThanOrEqual(31);
  });

  it("produces the same Date object as parsing the fr-CA formatted string", () => {
    const parisString = new Intl.DateTimeFormat("fr-CA", {
      timeZone: "Europe/Paris",
    }).format(new Date());
    const expected = new Date(parisString);
    const result = todayInParisDate();
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("round-trips: parsing the result's ISO date string returns the same value", () => {
    const result = todayInParisDate();
    const isoDate = result.toISOString().split("T")[0];
    const reparsed = new Date(isoDate);
    expect(reparsed.getTime()).toBe(result.getTime());
  });
});

// Regression: finding 2 — financial month end bound must cover the whole last Sunday
describe("getFinancialMonthBounds — contiguity and last-Sunday coverage", () => {
  it("consecutive financial months are contiguous (gap of exactly 1 ms)", () => {
    // Check 2024–2028 for every month pair
    for (let y = 2024; y <= 2028; y++) {
      for (let m = 0; m < 12; m++) {
        const thisMonth = new Date(y, m, 1);
        const nextMonth = new Date(y, m + 1, 1);
        const { end: thisEnd } = getFinancialMonthBounds(thisMonth);
        const { start: nextStart } = getFinancialMonthBounds(nextMonth);
        const gapMs = nextStart.getTime() - thisEnd.getTime();
        expect(gapMs).toBe(1);
      }
    }
  });

  it("end is always at 23:59:59.999", () => {
    for (let m = 0; m < 12; m++) {
      const { end } = getFinancialMonthBounds(new Date(2026, m, 1));
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
      expect(end.getMilliseconds()).toBe(999);
    }
  });

  it("a transaction at any time on the last Sunday falls inside the month", () => {
    // June 2026: last Sunday = Jul 5 2026
    const june2026 = new Date(2026, 5, 1);
    const { start, end } = getFinancialMonthBounds(june2026);

    const lastSunday = new Date(end);
    lastSunday.setHours(0, 0, 0, 0); // midnight

    const noon = new Date(end);
    noon.setHours(12, 0, 0, 0);

    const almostMidnight = new Date(end);
    almostMidnight.setHours(23, 59, 59, 998);

    for (const tx of [lastSunday, noon, almostMidnight]) {
      expect(tx >= start && tx <= end).toBe(true);
    }
  });

  it("every instant belongs to exactly one financial month (no dead zone)", () => {
    // For 2026, check boundary dates
    for (let m = 0; m < 12; m++) {
      const { end } = getFinancialMonthBounds(new Date(2026, m, 1));
      const nextStart = new Date(end.getTime() + 1);
      // nextStart should be within the next month's bounds
      const { start: ns, end: ne } = getFinancialMonthBounds(new Date(2026, m + 1, 1));
      expect(nextStart >= ns && nextStart <= ne).toBe(true);
    }
  });
});

describe("formatInstantShort", () => {
  it("dates a late-evening UTC timestamp on the Paris calendar day", () => {
    // 22:30 UTC on 9 Oct is 00:30 on 10 Oct in Paris (CEST).
    expect(formatInstantShort(new Date("2026-10-09T22:30:00Z"))).toBe("10/10/2026");
  });
});

describe("formatPercent", () => {
  // fr-FR separates the number and the sign with a no-break space (U+00A0).
  const nbsp = "\u00A0";

  it("formats ratios as whole French percentages", () => {
    expect(formatPercent(0)).toBe(`0${nbsp}%`);
    expect(formatPercent(0.625)).toBe(`63${nbsp}%`);
    expect(formatPercent(1)).toBe(`100${nbsp}%`);
  });

  it("does not clamp: over 100 % and negatives are shown as they are", () => {
    expect(formatPercent(1.5)).toBe(`150${nbsp}%`);
    expect(formatPercent(-0.2)).toBe(`-20${nbsp}%`);
  });
});

describe("formatDayShort", () => {
  it("shows the stored calendar day, not the day before, from a UTC-midnight date", () => {
    expect(formatDayShort(new Date("2026-10-09T00:00:00Z"))).toBe("ven. 9 oct.");
  });
});

describe("formatWeekSpan", () => {
  // Local bounds, as eachWeekOfInterval/endOfWeek build them (Vitest pins Europe/Paris).
  it("names the month once inside one month", () => {
    expect(formatWeekSpan(new Date(2026, 9, 5), new Date(2026, 9, 11, 23, 59, 59))).toBe("5–11 oct.");
  });

  it("names both months across a month boundary", () => {
    expect(formatWeekSpan(new Date(2026, 8, 28), new Date(2026, 9, 4, 23, 59, 59))).toBe(
      "28 sept.–4 oct.",
    );
  });
});

describe("capitalizeFirst", () => {
  it("capitalises the first letter only, as French dates need", () => {
    expect(capitalizeFirst("vendredi 9 octobre")).toBe("Vendredi 9 octobre");
    expect(capitalizeFirst("")).toBe("");
  });
});
