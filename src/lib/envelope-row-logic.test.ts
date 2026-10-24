import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { envelopeRowMeta } from "./envelope-row-logic";
import { formatCurrency } from "./format";

describe("envelopeRowMeta", () => {
  it("states the weekly reference and fills the bar by balance over it", () => {
    const row = envelopeRowMeta({ balance: 20, reference: 40, cadence: "WEEKLY" });
    expect(row.meta).toBe(`${formatCurrency(40)} par semaine`);
    expect(row.percent).toBe(50);
    expect(row.over).toBe(false);
  });

  it("states a monthly reference per month", () => {
    expect(envelopeRowMeta({ balance: 10, reference: 120, cadence: "MONTHLY" }).meta).toBe(
      `${formatCurrency(120)} par mois`,
    );
  });

  it("keeps a carried-over balance above the reference to a full bar, without pairing the two", () => {
    const row = envelopeRowMeta({ balance: 150, reference: 110, cadence: "MONTHLY" });
    expect(row.percent).toBe(100);
    expect(row.meta).not.toContain("sur");
    expect(row.meta).not.toContain(formatCurrency(150));
  });

  it("says by how much an overspent envelope is over", () => {
    const row = envelopeRowMeta({ balance: -6.06, reference: 40, cadence: "WEEKLY" });
    expect(row).toEqual({ meta: `dépassé de ${formatCurrency(6.06)}`, percent: 100, over: true });
  });

  it("treats float noise around zero as zero, not overspent", () => {
    const row = envelopeRowMeta({ balance: 0.1 + 0.2 - 0.3, reference: 40, cadence: "WEEKLY" });
    expect(row.over).toBe(false);
    expect(row.percent).toBeCloseTo(0, 6);
  });

  it("draws an empty bar when the reference is zero", () => {
    expect(envelopeRowMeta({ balance: 25, reference: 0, cadence: "WEEKLY" }).percent).toBe(0);
    expect(envelopeRowMeta({ balance: 25, reference: 0.004, cadence: "WEEKLY" }).percent).toBe(0);
  });

  it("keeps the bar within 0–100 for any amounts", () => {
    const money = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 });
    fc.assert(
      fc.property(money, money, fc.constantFrom("WEEKLY" as const, "MONTHLY" as const), (balance, reference, cadence) => {
        const { percent } = envelopeRowMeta({ balance, reference, cadence });
        return percent >= 0 && percent <= 100 + 1e-6;
      }),
      { numRuns: 1000 },
    );
  });
});
