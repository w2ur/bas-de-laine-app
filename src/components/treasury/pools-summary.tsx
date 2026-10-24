import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import {
  TreasuryAvailabilityValue,
  groupPoolsByAvailability,
} from "@/lib/treasury-availability";
import { ChevronRight } from "lucide-react";
import { LedgerRow } from "@/components/ui/ledger-row";

interface Pool {
  id: string;
  name: string;
  availability: TreasuryAvailabilityValue;
  amount: number;
  order: number;
}

interface PoolsSummaryProps {
  pools: Pool[];
}

export function PoolsSummary({ pools }: PoolsSummaryProps) {
  if (pools.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          Aucun compte configuré
        </p>
        <Link
          href="/tresorerie/pools"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          Ajouter un compte
        </Link>
      </div>
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
          <div className="rounded-xl border bg-card px-4">
            {group.items.map((pool) => (
              <LedgerRow key={pool.id} label={pool.name} amount={formatCurrency(pool.amount)} amountClassName="text-lg" />
            ))}
          </div>
        </section>
      ))}

      <Link
        href="/tresorerie/pools"
        className="flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Gérer les comptes
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
