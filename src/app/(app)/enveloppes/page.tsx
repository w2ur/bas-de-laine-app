export const dynamic = "force-dynamic";

import { getHousehold } from "@/lib/auth/server";
import { getEnvelopes, getFillPlan } from "@/lib/queries/envelopes";
import { getDashboardData } from "@/lib/queries/dashboard";
import { getCurrentFinancialMonth, getMonthLabel } from "@/lib/format";
import { formatWeekLabel } from "@/lib/week-logic";
import { LedgerTotal } from "@/components/home/ledger-total";
import { FillWeekRitual } from "@/components/home/fill-week-ritual";
import { EnvelopeList } from "@/components/home/envelope-list";
import { GoalSection } from "@/components/home/goal-section";
import Link from "next/link";
import { Receipt } from "lucide-react";

export default async function EnveloppesPage() {
  const { householdId } = await getHousehold();
  const month = getCurrentFinancialMonth();

  const [envelopes, dashboard, plan] = await Promise.all([
    getEnvelopes(householdId, month),
    getDashboardData(householdId, month),
    getFillPlan(householdId, month),
  ]);

  const budgetEnvelopes = envelopes.filter((e) => e.type === "BUDGET");
  const goalEnvelopes = envelopes.filter((e) => e.type === "GOAL");
  const totalSpent = budgetEnvelopes.reduce((sum, e) => sum + e.spent, 0);
  const available = budgetEnvelopes.reduce((sum, e) => sum + e.balance, 0);

  // Narrow to exactly what each client component needs — do not hand the
  // raw getEnvelopes items (which also carry fills/monthlyBudget) to the client.
  const envelopeListData = budgetEnvelopes.map((e) => ({
    id: e.id,
    name: e.name,
    icon: e.icon,
    color: e.color,
    fillCadence: e.fillCadence,
    effectiveMonthlyBudget: e.effectiveMonthlyBudget,
    weeklyIndicator: e.weeklyIndicator,
    balance: e.balance,
  }));

  const goalSectionData = goalEnvelopes.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    color: g.color,
    targetAmount: g.targetAmount,
    targetDate: g.targetDate,
    balance: g.balance,
    progress: g.progress,
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl">{formatWeekLabel(plan.week)}</h1>
        <p className="text-sm text-muted-foreground capitalize">{getMonthLabel(month)}</p>
      </header>

      <LedgerTotal available={available} remainingPool={dashboard.remainingPool} totalSpent={totalSpent} />

      <FillWeekRitual plan={plan} />

      <EnvelopeList envelopes={envelopeListData} />

      <GoalSection goals={goalSectionData} />

      <Link
        href="/enveloppes/historique"
        className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Receipt className="size-4" />
        Voir l&apos;historique
      </Link>
    </div>
  );
}
