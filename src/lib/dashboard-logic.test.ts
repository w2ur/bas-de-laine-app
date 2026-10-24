import { describe, it, expect } from "vitest";
import { computeEnvelopeStats, computePoolSummary } from "./dashboard-logic";

// Regression: 04c0b7a — poolMismatch compared cent-rounded week-scaled budgets
// against an unrounded week-scaled pool, so a fully allocated household
// (600 € budget, 600 € income) tripped the banner.
describe("dashboard pool numbers from envelope stats", () => {
  const mondays = 4;
  const allTx = [
    { type: "FILL" as const, amount: 138.46, date: new Date(Date.UTC(2026, 8, 7)) },
    { type: "SPEND" as const, amount: 40, date: new Date(Date.UTC(2026, 8, 9)) },
    { type: "FILL" as const, amount: 100, date: new Date(Date.UTC(2026, 7, 3)) }, // previous month
  ];
  const monthTx = allTx.slice(0, 2);

  it("keeps remainingPool = totalBudgets − month fills, and poolMismatch false when fully allocated", () => {
    const stats = computeEnvelopeStats({ monthlyBudget: 600, allTransactions: allTx, monthTransactions: monthTx, mondays });
    expect(stats.effectiveMonthlyBudget).toBeCloseTo(553.84, 6);
    expect(stats.filled).toBeCloseTo(138.46, 6);
    expect(stats.balance).toBeCloseTo(198.46, 6);
    const summary = computePoolSummary([{ ...stats, monthlyBudget: 600 }], 600, 0);
    expect(summary.remainingPool).toBeCloseTo(553.84 - 138.46, 6);
    expect(summary.poolMismatch).toBe(false);
  });

  it("poolMismatch compares configured monthlyBudget totals, not week-scaled ones (5 Mondays)", () => {
    // income 3000, charges 600 → household has 2400 to allocate.
    const income = 3000;
    const charges = 600;
    const envMondays = 5;

    const fullyAllocated = [1000, 800, 600].map((monthlyBudget) => ({
      ...computeEnvelopeStats({ monthlyBudget, allTransactions: [], monthTransactions: [], mondays: envMondays }),
      monthlyBudget,
    }));
    expect(computePoolSummary(fullyAllocated, income, charges).poolMismatch).toBe(false);

    const underAllocated = [1000, 800, 500].map((monthlyBudget) => ({
      ...computeEnvelopeStats({ monthlyBudget, allTransactions: [], monthTransactions: [], mondays: envMondays }),
      monthlyBudget,
    }));
    expect(computePoolSummary(underAllocated, income, charges).poolMismatch).toBe(true);
  });
});
