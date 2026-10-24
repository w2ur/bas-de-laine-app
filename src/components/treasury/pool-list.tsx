import { formatCurrency } from "@/lib/format";
import {
  TreasuryAvailabilityValue,
  groupPoolsByAvailability,
} from "@/lib/treasury-availability";
import { LedgerRow } from "@/components/ui/ledger-row";
import { PoolDialog } from "./pool-dialog";

interface Pool {
  id: string;
  name: string;
  availability: TreasuryAvailabilityValue;
  amount: number;
  order: number;
}

interface PoolListProps {
  pools: Pool[];
}

/** Accounts grouped by availability; the group heading names the tier once, so rows carry no badge. */
export function PoolList({ pools }: PoolListProps) {
  if (pools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Aucun compte configuré. Ajoutez votre premier compte pour commencer.
      </p>
    );
  }

  const grouped = groupPoolsByAvailability(pools);

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <section key={group.tier} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl">{group.label}</h2>
            <span className="font-display text-base tabular-nums text-muted-foreground">
              {formatCurrency(group.total)}
            </span>
          </div>
          <div className="rounded-xl border bg-card pl-4 pr-1">
            {group.items.map((pool) => (
              <LedgerRow
                key={pool.id}
                label={pool.name}
                amount={formatCurrency(pool.amount)}
                amountClassName="text-lg"
                trailing={<PoolDialog mode="edit" pool={pool} />}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
