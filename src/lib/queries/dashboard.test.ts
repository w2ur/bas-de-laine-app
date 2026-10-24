import { describe, it, expect } from "vitest";
import { computeEnvelopeStats, computePoolSummary } from "@/lib/dashboard-logic";
import { getFinancialMonthBounds } from "@/lib/format";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(amount: number, type: "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT", date: Date) {
  return { amount, type, date };
}

// ---------------------------------------------------------------------------
// computeEnvelopeStats
// ---------------------------------------------------------------------------

describe("computeEnvelopeStats", () => {
  it("fills and spends are month-scoped, balance is cumulative", () => {
    const { start: monthStart } = getFinancialMonthBounds(new Date(2026, 5, 1)); // June 2026

    // Transaction from a previous month
    const prevFill = makeTx(100, "FILL", new Date(2026, 4, 15)); // May — outside June
    // Transactions in current month
    const currFill = makeTx(200, "FILL", new Date(monthStart));
    const currSpend = makeTx(50, "SPEND", new Date(monthStart));

    const stats = computeEnvelopeStats({
      monthlyBudget: 500,
      allTransactions: [prevFill, currFill, currSpend],
      monthTransactions: [currFill, currSpend],
      mondays: 4,
    });

    // filled = only current month fills (not prevFill)
    expect(stats.filled).toBe(200);
    // spent = only current month spends
    expect(stats.spent).toBe(50);
    // balance = cumulative: prevFill(100) + currFill(200) - currSpend(50) = 250
    expect(stats.balance).toBe(250);
  });

  it("percentFilled is 0 when effectiveMonthlyBudget is 0", () => {
    const stats = computeEnvelopeStats({
      monthlyBudget: 0,
      allTransactions: [],
      monthTransactions: [],
      mondays: 4,
    });
    expect(stats.percentFilled).toBe(0);
  });

  it("computes weeklyIndicator and effectiveMonthlyBudget correctly for 4 and 5 Mondays", () => {
    const stats4 = computeEnvelopeStats({
      monthlyBudget: 520,
      allTransactions: [],
      monthTransactions: [],
      mondays: 4,
    });
    const stats5 = computeEnvelopeStats({
      monthlyBudget: 520,
      allTransactions: [],
      monthTransactions: [],
      mondays: 5,
    });
    const expectedWeekly = (520 * 12) / 52; // 120
    expect(stats4.weeklyIndicator).toBeCloseTo(expectedWeekly, 5);
    expect(stats4.effectiveMonthlyBudget).toBeCloseTo(expectedWeekly * 4, 5);
    expect(stats5.effectiveMonthlyBudget).toBeCloseTo(expectedWeekly * 5, 5);
  });

  it("regression (Finding 27): previous-month fill is included in cumulative balance", () => {
    // Before the fix, balance was computed only from month-filtered transactions.
    // A FILL from a prior month would be excluded — wrong.
    const { start: monthStart } = getFinancialMonthBounds(new Date(2026, 5, 1));

    const prevFill = makeTx(500, "FILL", new Date(2026, 4, 10)); // May — prior month
    const currFill = makeTx(100, "FILL", new Date(monthStart));

    const stats = computeEnvelopeStats({
      monthlyBudget: 200,
      allTransactions: [prevFill, currFill],
      monthTransactions: [currFill],
      mondays: 4,
    });

    // Cumulative balance must include the prior-month fill
    expect(stats.balance).toBe(600);
    // But filled (month KPI) must only count current month
    expect(stats.filled).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computePoolSummary
// ---------------------------------------------------------------------------

describe("computePoolSummary", () => {
  it("remainingPool = totalBudgets - totalBudgetFills (week-scaled)", () => {
    const stats = [
      { effectiveMonthlyBudget: 300, filled: 100, monthlyBudget: 325 },
      { effectiveMonthlyBudget: 200, filled: 150, monthlyBudget: 216.67 },
    ];
    const summary = computePoolSummary(stats, 3000, 1500);
    expect(summary.totalBudgets).toBe(500);
    expect(summary.totalBudgetFills).toBe(250);
    expect(summary.remainingPool).toBe(250);
  });

  it("regression (35f0e87): poolMismatch is not the raw pool vs week-scaled budgets", () => {
    // Raw pool = 3000 - 1000 = 2000, all budgeted (monthlyBudget sums to 2000)
    // Week-scaled effectiveMonthlyBudget figures are irrelevant to poolMismatch now.
    const totalIncome = 3000;
    const totalCharges = 1000;
    const stats = [{ effectiveMonthlyBudget: 1846.15, filled: 0, monthlyBudget: 2000 }];

    const summary = computePoolSummary(stats, totalIncome, totalCharges);
    expect(summary.poolMismatch).toBe(false);
  });

  it("regression (35f0e87 / 044ac9e): poolMismatch = false for a fully-allocated household regardless of Monday count", () => {
    // income=3000, charges=1000 → monthlyBudget must sum to 2000.
    // effectiveMonthlyBudget (week-scaled, cent-rounded) is irrelevant here.
    const totalIncome = 3000;
    const totalCharges = 1000;

    const stats = [
      { effectiveMonthlyBudget: 1107.69, filled: 1107.69, monthlyBudget: 1200 },
      { effectiveMonthlyBudget: 738.46, filled: 0, monthlyBudget: 800 },
    ];
    const summary = computePoolSummary(stats, totalIncome, totalCharges);
    expect(summary.poolMismatch).toBe(false);
  });

  it("poolMismatch = true when configured monthlyBudget totals do not match income - charges", () => {
    const totalIncome = 3000;
    const totalCharges = 1000;
    // monthlyBudget sums to 1900, not the 2000 the household actually has
    const stats = [{ effectiveMonthlyBudget: 1753.85, filled: 0, monthlyBudget: 1900 }];

    const summary = computePoolSummary(stats, totalIncome, totalCharges);
    expect(summary.poolMismatch).toBe(true);
  });
});
