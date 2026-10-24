import { prisma } from "@/lib/prisma";
import { getEnvelopes } from "@/lib/queries/envelopes";
import { computePoolSummary } from "@/lib/dashboard-logic";

export async function getDashboardData(householdId: string, month: Date) {
  const [household, envelopes, recurringCharges] = await Promise.all([
    prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
    getEnvelopes(householdId, month),
    prisma.recurringCharge.findMany({ where: { householdId, active: true } }),
  ]);

  const totalIncome = Number(household.income);
  const totalCharges = recurringCharges.reduce((sum, c) => sum + Number(c.amount), 0);

  // Pool = income - charges (raw, for display)
  const pool = totalIncome - totalCharges;

  // totalFills: all envelopes (BUDGET + GOAL), month-scoped
  const totalFills = envelopes.reduce((sum, env) => sum + (env.type === "BUDGET" ? env.filled : env.monthFilled), 0);

  // BUDGET items already carry the full per-envelope arithmetic computed by
  // getEnvelopes (which shares this same cache()d query with the layout and
  // the enveloppes page) — no need to recompute via computeEnvelopeStats.
  const envelopeBalances = envelopes.flatMap((env) => {
    if (env.type !== "BUDGET") return [];
    const { id, name, icon, color, effectiveMonthlyBudget, weeklyIndicator, filled, spent, balance, percentFilled, monthlyBudget } = env;
    return [{ id, name, icon, color, effectiveMonthlyBudget, weeklyIndicator, filled, spent, balance, percentFilled, monthlyBudget }];
  });

  const { totalBudgets, totalBudgetFills, remainingPool, poolMismatch } = computePoolSummary(
    envelopeBalances,
    totalIncome,
    totalCharges
  );

  return {
    totalIncome,
    totalCharges,
    pool,
    totalFills,
    totalBudgets,
    totalBudgetFills,
    remainingPool,
    poolMismatch,
    envelopeBalances,
  };
}
