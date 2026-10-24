import { formatCurrency, formatInstantShort } from "@/lib/format";
import { adjustmentDisplayLabel, type TreasuryAdjustmentType } from "@/lib/treasury-display";

interface AdjustmentHistoryProps {
  adjustments: {
    id: string;
    amount: number;
    type: TreasuryAdjustmentType;
    label: string | null;
    createdAt: Date;
  }[];
}

export function AdjustmentHistory({ adjustments }: AdjustmentHistoryProps) {
  if (adjustments.length === 0) return null;

  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Derniers ajustements
        <span className="text-muted-foreground group-open:hidden">Afficher</span>
        <span className="text-muted-foreground hidden group-open:inline">Masquer</span>
      </summary>
      <ul className="divide-y border-t">
        {adjustments.map((adj) => (
          <li key={adj.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0 truncate">{adjustmentDisplayLabel(adj.type, adj.label)}</span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className={adj.type === "DEDUCT" ? "text-spend" : ""}>
                {adj.type === "DEDUCT" ? "-" : ""}
                {formatCurrency(adj.amount)}
              </span>
              <span className="text-muted-foreground">{formatInstantShort(adj.createdAt)}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
