import { describe, it, expect } from "vitest";
import { goalEnvelopeSchema } from "./schemas/envelope";
import { computeFillShortcuts } from "./fill-shortcuts";
import { getFinancialMonthBounds } from "./format";

describe("Regression tests", () => {
  // Regression: 50ec7b6 — empty string targetDate crashed goal creation
  // Before fix: z.coerce.date().optional() would fail on "" (empty string from HTML input)
  // The preprocess step now converts "" → undefined before Zod validation
  it("goalEnvelopeSchema accepts empty string targetDate (50ec7b6)", () => {
    const result = goalEnvelopeSchema.safeParse({
      name: "Vacances",
      targetAmount: 1000,
      targetDate: "",
      icon: "",
      color: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetDate).toBeUndefined();
    }
  });

  // Regression: 50ec7b6 — undefined targetDate must also work
  it("goalEnvelopeSchema accepts undefined targetDate (50ec7b6)", () => {
    const result = goalEnvelopeSchema.safeParse({
      name: "Fonds urgence",
      targetAmount: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetDate).toBeUndefined();
    }
  });

  // Regression: 50ec7b6 — valid date strings must still parse correctly
  it("goalEnvelopeSchema still accepts valid date string after preprocess fix (50ec7b6)", () => {
    const result = goalEnvelopeSchema.safeParse({
      name: "Noël",
      targetAmount: 500,
      targetDate: "2026-12-25",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetDate).toBeInstanceOf(Date);
    }
  });

  // Regression: computeFillShortcuts must handle large balances exceeding weekly indicator
  // This validates that topUpToWeekly is clamped to 0 (not negative) when balance > weekly target
  it("computeFillShortcuts omits top-up pill when balance exceeds weekly indicator", () => {
    const weeklyIndicator = (400 * 12) / 52;
    const shortcuts = computeFillShortcuts({
      weeklyIndicator,
      effectiveMonthlyBudget: weeklyIndicator * 4,
      balance: 200, // already above weekly indicator
      filled: 0,
    });
    // Should NOT have a "=weekly" pill since balance > weeklyIndicator
    const topUpPill = shortcuts.find((s) => s.label.startsWith("="));
    expect(topUpPill).toBeUndefined();
  });

  // Regression: getFinancialMonthBounds for February — edge case where short month
  // could produce empty financial month or start after end
  it("getFinancialMonthBounds handles February correctly (short month)", () => {
    // February 2026 starts on Sunday → first Monday is Feb 2
    const bounds = getFinancialMonthBounds(new Date(2026, 1, 1));
    expect(bounds.start.getDay()).toBe(1); // Monday
    expect(bounds.end.getDay()).toBe(0); // Sunday
    expect(bounds.start < bounds.end).toBe(true);
    // Start must be in February
    expect(bounds.start.getMonth()).toBe(1);
  });

  // Regression: getFinancialMonthBounds for month starting on Monday
  // Ensures no off-by-one when the 1st is already Monday
  it("getFinancialMonthBounds when month starts on Monday", () => {
    // June 2026 starts on a Monday
    const bounds = getFinancialMonthBounds(new Date(2026, 5, 1));
    expect(bounds.start.getDate()).toBe(1); // Should start on the 1st
    expect(bounds.start.getDay()).toBe(1); // Monday
  });
});
