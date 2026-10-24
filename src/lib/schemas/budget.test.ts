import { describe, it, expect } from "vitest";
import { incomeSchema } from "./budget";

describe("incomeSchema", () => {
  it("accepts a valid income", () => {
    const result = incomeSchema.safeParse({ income: 5000 });
    expect(result.success).toBe(true);
  });

  it("accepts zero income", () => {
    const result = incomeSchema.safeParse({ income: 0 });
    expect(result.success).toBe(true);
  });

  it("rejects negative income", () => {
    const result = incomeSchema.safeParse({ income: -100 });
    expect(result.success).toBe(false);
  });

  it("coerces string to number", () => {
    const result = incomeSchema.safeParse({ income: "3500" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.income).toBe(3500);
    }
  });

  // MoneyInput submits a dot-decimal string (e.g. "9.95")
  it("coerces a dot-decimal string from MoneyInput", () => {
    const result = incomeSchema.safeParse({ income: "9.95" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.income).toBe(9.95);
    }
  });

  it("rejects non-numeric string", () => {
    const result = incomeSchema.safeParse({ income: "abc" });
    expect(result.success).toBe(false);
  });

  // Regression: finding 56 — Decimal(12,2) overflow must be rejected
  it("rejects Decimal(12,2)-overflowing income", () => {
    const result = incomeSchema.safeParse({ income: 10_000_000_000 });
    expect(result.success).toBe(false);
  });
});
