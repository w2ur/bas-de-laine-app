export const dynamic = "force-dynamic";

import { getHousehold } from "@/lib/auth/server";
import { getAllEnvelopes } from "@/lib/queries/envelopes";
import { getRecurringCharges } from "@/lib/queries/charges";
import { activeChargesTotal, envelopeManagerRow, goalManagerRow } from "@/lib/settings-rows";
import { IncomeForm } from "@/components/settings/income-form";
import { EnvelopeManager } from "@/components/settings/envelope-manager";
import { GoalManager } from "@/components/settings/goal-manager";
import { BackupSection } from "@/components/settings/backup-section";
import { SignOutSection } from "@/components/settings/sign-out-section";
import { formatCurrency } from "@/lib/format";
import { LedgerRow } from "@/components/ui/ledger-row";
import { ChevronRight } from "lucide-react";

export default async function ConfigurationPage() {
  const { user, household, householdId } = await getHousehold();
  const [envelopes, charges] = await Promise.all([getAllEnvelopes(householdId), getRecurringCharges(householdId)]);
  const totalCharges = activeChargesTotal(charges);
  const activeCount = charges.filter((c) => c.active).length;

  const income = Number(household.income);
  const pool = income - totalCharges;
  const budgetEnvelopes = envelopes.filter((e) => e.type === "BUDGET");
  const goalEnvelopes = envelopes.filter((e) => e.type === "GOAL");
  const totalBudgets = budgetEnvelopes
    .filter((e) => !e.isArchived)
    .reduce((sum, e) => sum + Number(e.monthlyBudget), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] leading-tight">Configuration</h1>
      </div>

      <IncomeForm currentIncome={income} />

      <div className="rounded-xl border bg-card px-4">
        <LedgerRow
          href="/configuration/charges-fixes"
          label="Charges fixes"
          meta={`${activeCount} charge${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}`}
          amount={
            <span className="flex items-center gap-1">
              {formatCurrency(totalCharges)}
              <span className="font-sans text-xs text-muted-foreground">/mois</span>
              {/* Inside the link: the chevron is where a drill-in tap lands. */}
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
          }
          amountClassName="text-lg"
        />
      </div>

      <EnvelopeManager
        envelopes={budgetEnvelopes.map(envelopeManagerRow)}
        pool={pool}
        totalBudgets={totalBudgets}
      />

      <GoalManager
        goals={goalEnvelopes.map(goalManagerRow)}
      />

      <BackupSection />

      <SignOutSection email={user.email} />
    </div>
  );
}
