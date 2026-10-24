import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { eachWeekOfInterval, endOfWeek } from "date-fns";
import { getFinancialMonthBounds, getMondaysInFinancialMonth, todayInParisDate } from "@/lib/format";
import { computeEnvelopeBalance } from "@/lib/envelope-balance";
import { computeWeeklyIndicator, computeGoalContribution } from "@/lib/budget-math";
import { computeEnvelopeStats } from "@/lib/dashboard-logic";
import { getFinancialWeek, computeFillPlan } from "@/lib/week-logic";

/**
 * Wrapped in React `cache()` so the layout and the enveloppes page — which
 * both call this with the same (householdId, month) for one request — share
 * a single database round-trip instead of querying twice per request.
 */
export const getEnvelopes = cache(async function getEnvelopes(householdId: string, month: Date) {
  const { start: monthStart, end: monthEnd } = getFinancialMonthBounds(month);
  const mondays = getMondaysInFinancialMonth(month);

  const envelopes = await prisma.envelope.findMany({
    where: { householdId, isArchived: false },
    orderBy: { sortOrder: "asc" },
    include: {
      transactions: true, // all-time for cumulative balance
    },
  });

  return envelopes.map((env) => {
    const balance = computeEnvelopeBalance(env.transactions);

    if (env.type === "GOAL") {
      const targetAmount = Number(env.targetAmount);
      const progress = targetAmount > 0 ? Math.min(balance / targetAmount, 1) : 0;
      const monthlyContribution = computeGoalContribution(targetAmount, balance, env.targetDate);

      const monthFilled = env.transactions
        .filter((t) => {
          const d = new Date(t.date);
          return t.type === "FILL" && d >= monthStart && d <= monthEnd;
        })
        .reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        id: env.id,
        name: env.name,
        icon: env.icon,
        color: env.color,
        type: env.type as "GOAL",
        targetAmount,
        targetDate: env.targetDate,
        balance,
        progress,
        monthlyContribution,
        monthFilled,
      };
    }

    const monthlyBudget = Number(env.monthlyBudget);

    // Monthly-scoped KPIs for progress bar
    const monthTx = env.transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= monthStart && d <= monthEnd;
    });
    const stats = computeEnvelopeStats({
      monthlyBudget,
      allTransactions: env.transactions,
      monthTransactions: monthTx,
      mondays,
    });

    return {
      id: env.id,
      name: env.name,
      icon: env.icon,
      color: env.color,
      type: env.type as "BUDGET",
      monthlyBudget,
      fillCadence: env.fillCadence,
      // Month-scoped only: computeFillPlan's windows (the week, or the
      // financial month for MONTHLY cadence) never extend past the current
      // financial month, and this is serialized to the client — keep it small.
      fills: monthTx
        .filter((t) => t.type === "FILL")
        .map((t) => ({ date: t.date, amount: Number(t.amount) })),
      ...stats,
    };
  });
});

/**
 * "yyyy-MM-dd" from a Date's LOCAL components (matching the calendarDate
 * schema). Computed server-side from `week.monday`, which is itself derived
 * from the Paris-anchored `todayInParisDate()` — so this never depends on
 * the viewer's browser timezone the way client-side reconstruction would.
 */
function toCalendarString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The Monday ritual's proposal for the current week. Built on the cache()d
 * getEnvelopes result, so the layout, the page and this call share one query.
 * `fills` on each envelope is month-scoped (not all-time) — computeFillPlan's
 * windows (the week, or the financial month for MONTHLY cadence) never
 * extend past the current financial month, so semantics are unchanged.
 */
export async function getFillPlan(householdId: string, month: Date) {
  const envelopes = await getEnvelopes(householdId, month);
  const week = getFinancialWeek(month, todayInParisDate());
  const monthBounds = getFinancialMonthBounds(month);
  const rows = computeFillPlan(
    envelopes.flatMap((e) =>
      e.type === "BUDGET"
        ? [{
            id: e.id, name: e.name, icon: e.icon, color: e.color,
            fillCadence: e.fillCadence, weeklyIndicator: e.weeklyIndicator,
            effectiveMonthlyBudget: e.effectiveMonthlyBudget, fills: e.fills,
          }]
        : []
    ),
    week,
    monthBounds
  );
  return { week, rows, mondayDate: toCalendarString(week.monday) };
}

export async function getEnvelopeDetail(householdId: string, envelopeId: string, month: Date) {
  const { start: monthStart, end: monthEnd } = getFinancialMonthBounds(month);

  const envelope = await prisma.envelope.findFirst({
    where: { id: envelopeId, householdId },
    include: {
      transactions: {
        orderBy: { date: "asc" },
        // The other side of a transfer, named in the transaction row.
        include: { linkedTransaction: { select: { envelope: { select: { name: true, icon: true } } } } },
      },
    },
  });

  if (!envelope) return null;

  if (envelope.type === "GOAL") {
    const balance = computeEnvelopeBalance(envelope.transactions);
    const targetAmount = Number(envelope.targetAmount);
    const progress = targetAmount > 0 ? Math.min(balance / targetAmount, 1) : 0;
    const monthlyContribution = computeGoalContribution(targetAmount, balance, envelope.targetDate);

    return {
      id: envelope.id,
      name: envelope.name,
      icon: envelope.icon,
      color: envelope.color,
      type: envelope.type as "GOAL",
      targetAmount,
      targetDate: envelope.targetDate,
      balance,
      progress,
      monthlyContribution,
      transactions: envelope.transactions.map((t) => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        type: t.type,
        description: t.description,
        linkedTransactionId: t.linkedTransactionId,
        counterpart: t.linkedTransaction?.envelope ?? null,
      })),
    };
  }

  const mondays = getMondaysInFinancialMonth(month);
  const balance = computeEnvelopeBalance(envelope.transactions);
  const monthlyBudget = Number(envelope.monthlyBudget);
  const weeklyIndicator = computeWeeklyIndicator(monthlyBudget);
  const effectiveMonthlyBudget = weeklyIndicator * mondays;

  // Monthly-scoped KPIs
  const monthTx = envelope.transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= monthStart && d <= monthEnd;
  });
  const totalFilled = monthTx
    .filter((t) => t.type === "FILL")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalSpent = monthTx
    .filter((t) => t.type === "SPEND")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Weekly breakdown using financial month bounds (clean Mon-Sun weeks)
  const weeks = eachWeekOfInterval(
    { start: monthStart, end: monthEnd },
    { weekStartsOn: 1 }
  );

  const weeklyBreakdown = weeks.map((weekStart, i) => {
    const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekTx = monthTx.filter((t) => {
      const d = new Date(t.date);
      return d >= weekStart && d <= wEnd;
    });
    const weekFilled = weekTx
      .filter((t) => t.type === "FILL")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const weekSpent = weekTx
      .filter((t) => t.type === "SPEND")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      week: i + 1,
      start: weekStart,
      end: wEnd,
      filled: weekFilled,
      spent: weekSpent,
      budget: weeklyIndicator,
      transactions: weekTx.map((t) => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        type: t.type,
        description: t.description,
        linkedTransactionId: t.linkedTransactionId,
        counterpart: t.linkedTransaction?.envelope ?? null,
      })),
    };
  });

  return {
    id: envelope.id,
    name: envelope.name,
    icon: envelope.icon,
    color: envelope.color,
    type: envelope.type as "BUDGET",
    fillCadence: envelope.fillCadence,
    effectiveMonthlyBudget,
    weeklyIndicator,
    totalFilled,
    totalSpent,
    balance,
    weeklyBreakdown,
  };
}

export async function getRecentTransactions(householdId: string, month: Date) {
  const { start: monthStart, end: monthEnd } = getFinancialMonthBounds(month);

  const transactions = await prisma.envelopeTransaction.findMany({
    where: {
      date: { gte: monthStart, lte: monthEnd },
      envelope: {
        householdId,
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      envelope: {
        select: { id: true, name: true, icon: true, color: true },
      },
      linkedTransaction: {
        select: {
          envelope: {
            select: { name: true, icon: true },
          },
        },
      },
    },
  });

  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    amount: Number(t.amount),
    type: t.type,
    description: t.description,
    envelope: t.envelope,
    counterpart: t.linkedTransaction?.envelope ?? null,
    linkedTransactionId: t.linkedTransactionId,
  }));
}

export async function getAllEnvelopes(householdId: string) {
  return prisma.envelope.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
  });
}
