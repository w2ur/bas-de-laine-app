import { formatCurrency } from "@/lib/format";
import { AVAILABLE_BALANCE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { amountGreaterThan } from "@/lib/money";

interface LedgerTotalProps {
  /** Sum of BUDGET envelope balances — cumulative, see AVAILABLE_BALANCE_LABEL. */
  available: number;
  remainingPool: number;
  totalSpent: number;
}

/**
 * The home's one lead figure, closed by a double rule the way a carnet de
 * comptes closes a column (DESIGN.md, "Signature" — used here only).
 */
export function LedgerTotal({ available, remainingPool, totalSpent }: LedgerTotalProps) {
  return (
    <section aria-label={AVAILABLE_BALANCE_LABEL}>
      <p className="text-sm text-muted-foreground">{AVAILABLE_BALANCE_LABEL}</p>
      <p
        className={cn(
          "font-display text-[40px] leading-none tabular-nums",
          amountGreaterThan(0, available) ? "text-spend" : "text-foreground",
        )}
      >
        {formatCurrency(available)}
      </p>
      <div className="mt-3 border-t-[3px] border-double border-foreground/70" aria-hidden="true" />
      <p className="mt-2 text-sm text-muted-foreground">
        Reste à répartir{" "}
        <span className={cn("font-display text-base tabular-nums", amountGreaterThan(0, remainingPool) ? "text-spend" : "text-foreground")}>
          {formatCurrency(remainingPool)}
        </span>
        {" · "}Dépensé ce mois{" "}
        <span className="font-display text-base tabular-nums text-foreground">{formatCurrency(totalSpent)}</span>
      </p>
    </section>
  );
}
