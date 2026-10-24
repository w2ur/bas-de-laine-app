/**
 * Pure computation helpers for dashboard statistics.
 *
 * No database or Next.js dependencies — extracted here so they can be
 * imported and tested with Vitest without needing DATABASE_URL.
 */

import { computeEnvelopeBalance } from "@/lib/envelope-balance";
import { computeWeeklyIndicator } from "@/lib/budget-math";
import { amountsEqual } from "@/lib/money";
import type { EnvelopeTransactionType } from "@prisma/client";

/** Minimal transaction shape accepted by computeEnvelopeStats */
export interface TransactionWithDate {
  amount: { toString(): string } | number;
  type: EnvelopeTransactionType;
  date: Date | string;
}

export interface TransactionWithoutDate {
  amount: { toString(): string } | number;
  type: EnvelopeTransactionType;
}

export interface EnvelopeMonthData {
  monthlyBudget: number;
  /** All-time transactions for cumulative balance */
  allTransactions: TransactionWithDate[];
  /** Month-scoped transactions (gte monthStart, lte monthEnd) for filled/spent KPIs */
  monthTransactions: TransactionWithoutDate[];
  mondays: number;
}

export interface EnvelopePoolStats {
  effectiveMonthlyBudget: number;
  weeklyIndicator: number;
  filled: number;
  spent: number;
  /** Cumulative balance from all-time transactions */
  balance: number;
  percentFilled: number;
}

export interface PoolSummary {
  totalBudgets: number;
  totalBudgetFills: number;
  remainingPool: number;
  /**
   * True when sum(BUDGET monthlyBudget) ≠ (income − charges). Compared on
   * the raw monthly amounts the household actually configured — the same
   * comparison `envelope-manager.tsx` already makes — not on week-scaled
   * figures.
   *
   * Regression note (35f0e87): the old code compared totalBudgets against
   * the RAW pool (income−charges), which produced a false mismatch in every
   * 4-Monday month for a fully-allocated household. That was fixed by
   * comparing week-scaled totals instead, but week-scaling introduced a new
   * false positive: each envelope's `effectiveMonthlyBudget` is cent-rounded
   * (`computeWeeklyIndicator` rounds the weekly figure, then multiplies by
   * `mondays`), so the rounding error is amplified by `mondays` and can
   * exceed `amountsEqual`'s half-cent tolerance even for a fully-allocated
   * household (e.g. 600 € budget vs 600 € income → 553.84 rounded vs
   * 553.846153... unrounded). Comparing the raw monthly amounts instead
   * avoids both the week-scaling mismatch and this rounding amplification.
   */
  poolMismatch: boolean;
}

/**
 * Computes per-envelope stats: fills/spends from month-scoped transactions,
 * but balance from all-time transactions (cumulative semantics).
 *
 * This distinction is critical: `filled` and `spent` are monthly KPIs used
 * for progress bars; `balance` is the cumulative envelope value used for
 * transfer validation and carry-over display.
 */
export function computeEnvelopeStats(env: EnvelopeMonthData): EnvelopePoolStats {
  const monthlyBudget = env.monthlyBudget;
  const weeklyIndicator = computeWeeklyIndicator(monthlyBudget);
  const effectiveMonthlyBudget = weeklyIndicator * env.mondays;

  const filled = env.monthTransactions
    .filter((t) => t.type === "FILL")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const spent = env.monthTransactions
    .filter((t) => t.type === "SPEND")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Cumulative balance from ALL transactions (including prior months)
  const balance = computeEnvelopeBalance(env.allTransactions);

  const percentFilled = effectiveMonthlyBudget > 0 ? filled / effectiveMonthlyBudget : 0;

  return { effectiveMonthlyBudget, weeklyIndicator, filled, spent, balance, percentFilled };
}

/**
 * Computes pool-level summary statistics.
 *
 * `totalBudgets`, `totalBudgetFills` and `remainingPool` stay week-scaled
 * (they feed the progress UI, which is itself week-scaled). `poolMismatch`
 * is deliberately compared on the raw monthly amounts instead — see the
 * `PoolSummary.poolMismatch` doc comment for why week-scaling produces a
 * false positive here.
 */
export function computePoolSummary(
  envelopeStats: { effectiveMonthlyBudget: number; filled: number; monthlyBudget: number }[],
  totalIncome: number,
  totalCharges: number
): PoolSummary {
  const totalBudgets = envelopeStats.reduce((sum, e) => sum + e.effectiveMonthlyBudget, 0);
  const totalBudgetFills = envelopeStats.reduce((sum, e) => sum + e.filled, 0);
  const remainingPool = totalBudgets - totalBudgetFills;

  const totalMonthlyBudgets = envelopeStats.reduce((sum, e) => sum + e.monthlyBudget, 0);
  const poolMismatch = !amountsEqual(totalMonthlyBudgets, totalIncome - totalCharges);

  return { totalBudgets, totalBudgetFills, remainingPool, poolMismatch };
}
