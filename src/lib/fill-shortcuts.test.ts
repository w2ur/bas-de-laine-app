import { describe, it, expect } from "vitest";
import { computeFillShortcuts } from "./fill-shortcuts";

describe("computeFillShortcuts", () => {
  it("returns all four shortcuts for a normal envelope", () => {
    const result = computeFillShortcuts({
      weeklyIndicator: 50,
      effectiveMonthlyBudget: 200,
      balance: 30,
      filled: 50,
    });
    expect(result).toEqual([
      { label: "+50,00\u00A0€/sem", cents: 5000 },
      { label: "=50,00\u00A0€/sem", cents: 2000 },
      { label: "Reste\u00A0: 150,00\u00A0€", cents: 15000 },
      { label: "+200,00\u00A0€/mois", cents: 20000 },
    ]);
  });

  it("hides pills with zero or negative amounts", () => {
    const result = computeFillShortcuts({
      weeklyIndicator: 50,
      effectiveMonthlyBudget: 200,
      balance: 60,
      filled: 200,
    });
    expect(result).toEqual([
      { label: "+50,00\u00A0€/sem", cents: 5000 },
      { label: "+200,00\u00A0€/mois", cents: 20000 },
    ]);
  });

  it("returns empty array when effectiveMonthlyBudget is 0", () => {
    const result = computeFillShortcuts({
      weeklyIndicator: 0,
      effectiveMonthlyBudget: 0,
      balance: 10,
      filled: 0,
    });
    expect(result).toEqual([]);
  });

  it("handles negative balance correctly", () => {
    const result = computeFillShortcuts({
      weeklyIndicator: 50,
      effectiveMonthlyBudget: 200,
      balance: -20,
      filled: 0,
    });
    const weeklyItem = result.find((r) => r.label.startsWith("="));
    expect(weeklyItem).toEqual({ label: "=50,00\u00A0€/sem", cents: 7000 });
  });

  it("rounds cents correctly for non-integer weekly indicator", () => {
    const weeklyIndicator = (100 * 12) / 52;
    const result = computeFillShortcuts({
      weeklyIndicator,
      effectiveMonthlyBudget: weeklyIndicator * 4,
      balance: 0,
      filled: 0,
    });
    const weekly = result.find((r) => r.label.startsWith("+") && r.label.includes("/sem"));
    expect(weekly?.cents).toBe(2308);
  });

  it("reflects 5-Monday month with higher effective budget", () => {
    const weeklyIndicator = 50;
    const result = computeFillShortcuts({
      weeklyIndicator,
      effectiveMonthlyBudget: weeklyIndicator * 5,
      balance: 0,
      filled: 100,
    });
    const reste = result.find((r) => r.label.startsWith("Reste"));
    // 250 - 100 = 150
    expect(reste?.cents).toBe(15000);
    const monthly = result.find((r) => r.label.includes("/mois"));
    expect(monthly?.cents).toBe(25000);
  });
});
