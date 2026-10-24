"use client";

import { Switch } from "@/components/ui/switch";
import { LedgerRow } from "@/components/ui/ledger-row";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChargeDialog } from "./charge-dialog";
import { toggleCharge } from "@/actions/charges";
import { toast } from "sonner";

interface Charge {
  id: string;
  name: string;
  amount: number;
  dayOfMonth: number;
  active: boolean;
}

interface ChargeListProps {
  charges: Charge[];
}

/** One ledger list on every width: name, the day it is taken, the amount; pause and edit beside it. */
export function ChargeList({ charges }: ChargeListProps) {
  async function handleToggle(id: string, active: boolean) {
    const result = await toggleCharge(id, active);
    if (result?.error) {
      toast.error(result.error);
    }
  }

  if (charges.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Aucune charge fixe.</p>;
  }

  return (
    <div className="rounded-xl border bg-card pl-4 pr-1">
      {charges.map((charge) => (
        <LedgerRow
          key={charge.id}
          label={charge.name}
          meta={`le ${charge.dayOfMonth} du mois${charge.active ? "" : " · en pause"}`}
          amount={formatCurrency(charge.amount)}
          amountClassName={cn("text-lg", !charge.active && "text-muted-foreground")}
          trailing={
            <span className="flex shrink-0 items-center">
              <label className="flex size-11 items-center justify-center">
                <span className="sr-only">{charge.active ? `Mettre en pause ${charge.name}` : `Réactiver ${charge.name}`}</span>
                <Switch
                  checked={charge.active}
                  onCheckedChange={(checked) => handleToggle(charge.id, checked)}
                />
              </label>
              <ChargeDialog charge={charge} />
            </span>
          }
        />
      ))}
    </div>
  );
}
