export const dynamic = "force-dynamic";

import { getHousehold } from "@/lib/auth/server";
import { getRecurringCharges } from "@/lib/queries/charges";
import { activeChargesTotal, chargeRow } from "@/lib/settings-rows";
import { formatCurrency } from "@/lib/format";
import { amountGreaterThan } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ChargeList } from "@/components/charges/charge-list";
import { ChargeDialog } from "@/components/charges/charge-dialog";

export default async function ChargesFixesPage() {
  const { household, householdId } = await getHousehold();
  const charges = await getRecurringCharges(householdId);
  const totalActive = activeChargesTotal(charges);
  const income = Number(household.income);
  const afterCharges = income - totalActive;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[28px] leading-tight">Charges fixes</h1>
        <ChargeDialog />
      </div>

      <section>
        <p className="text-sm text-muted-foreground">Après charges</p>
        <p className={cn("font-display text-[40px] leading-none tabular-nums", amountGreaterThan(0, afterCharges) && "text-spend")}>
          {formatCurrency(afterCharges)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Revenus <span className="font-display text-base text-foreground">{formatCurrency(income)}</span>
          {" · "}Charges actives <span className="font-display text-base text-foreground">{formatCurrency(totalActive)}</span>
        </p>
      </section>

      <ChargeList
        charges={charges.map(chargeRow)}
      />
    </div>
  );
}
