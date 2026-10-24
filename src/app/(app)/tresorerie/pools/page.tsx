export const dynamic = "force-dynamic";

import { getHousehold } from "@/lib/auth/server";
import { getTreasury } from "@/lib/queries/treasury";
import { formatCurrency } from "@/lib/format";
import { PoolList } from "@/components/treasury/pool-list";
import { PoolDialog } from "@/components/treasury/pool-dialog";
import { RefreshButton } from "@/components/treasury/refresh-button";

export default async function PoolsPage() {
  const { householdId } = await getHousehold();
  const treasury = await getTreasury(householdId);

  if (!treasury) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-[28px] leading-tight">Comptes</h1>
        <p className="text-muted-foreground text-sm py-8 text-center">
          Aucune trésorerie configurée
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[28px] leading-tight">Comptes</h1>
        <PoolDialog mode="create" />
      </div>

      <PoolList pools={treasury.pools} />

      {treasury.pools.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted-foreground">Total des comptes</p>
            <p className="font-display text-xl tabular-nums">{formatCurrency(treasury.poolsTotal)}</p>
          </div>
          <RefreshButton />
        </div>
      )}
    </div>
  );
}
