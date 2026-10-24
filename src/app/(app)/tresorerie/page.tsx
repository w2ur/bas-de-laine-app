export const dynamic = "force-dynamic";

import { getHousehold } from "@/lib/auth/server";
import { getTreasury } from "@/lib/queries/treasury";
import { isTreasuryStale, lastBalanceWrite } from "@/lib/treasury-display";
import { TreasuryTotalCard } from "@/components/treasury/treasury-total-card";
import { PoolsSummary } from "@/components/treasury/pools-summary";
import { AdjustmentHistory } from "@/components/treasury/adjustment-history";

export default async function TresoreriePage() {
  const { householdId } = await getHousehold();

  const treasury = await getTreasury(householdId);
  const lastUpdate = treasury ? lastBalanceWrite(treasury.adjustments) : null;
  const hasPools = (treasury?.pools.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[28px] leading-tight">Trésorerie</h1>

      {treasury ? (
        <>
          <TreasuryTotalCard
            balance={treasury.balance}
            poolsTotal={hasPools ? treasury.poolsTotal : null}
            lastUpdate={lastUpdate}
            stale={hasPools && isTreasuryStale(lastUpdate, new Date())}
          />
          <PoolsSummary pools={treasury.pools} />
          <AdjustmentHistory adjustments={treasury.adjustments} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm py-8 text-center">
          Aucune trésorerie configurée
        </p>
      )}
    </div>
  );
}
