export const dynamic = "force-dynamic";

import { getHousehold } from "@/lib/auth/server";
import { getEnvelopeDetail } from "@/lib/queries/envelopes";
import {
  capitalizeFirst,
  formatCurrency,
  formatPercent,
  formatWeekSpan,
  getCurrentFinancialMonth,
  getMonthLabel,
} from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EnvelopeDetailActions } from "@/components/envelopes/envelope-detail-actions";
import { GoalDetailActions } from "@/components/envelopes/goal-detail-actions";
import { TransactionList } from "@/components/envelopes/transaction-row";
import { weekRowDisplay } from "@/lib/envelope-detail-logic";
import { amountGreaterThan } from "@/lib/money";
import { cn } from "@/lib/utils";

function DetailHeader({ title, subtitle }: { title: string; subtitle: string | null }) {
  return (
    <header className="flex items-center gap-1">
      <Link
        href="/enveloppes"
        aria-label="Retour aux enveloppes"
        className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ChevronLeft className="size-6" aria-hidden="true" />
      </Link>
      <div className="min-w-0">
        <h1 className="truncate font-display text-[28px] leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </header>
  );
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
    </div>
  );
}

export default async function EnvelopeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { householdId } = await getHousehold();
  const month = getCurrentFinancialMonth();
  const detail = await getEnvelopeDetail(householdId, id, month);

  if (!detail) notFound();

  const barColor = detail.color || "var(--color-primary)";
  const title = `${detail.icon ? `${detail.icon} ` : ""}${detail.name}`;

  if (detail.type === "GOAL") {
    const progress = Math.min(Math.max(detail.progress, 0), 1);
    const targetLabel = detail.targetDate
      ? new Date(detail.targetDate).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
      : null;

    return (
      <div className="space-y-6">
        <DetailHeader title={title} subtitle="Objectif" />

        <section className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Solde</p>
            <p className="font-display text-[40px] leading-none tabular-nums">{formatCurrency(detail.balance)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Objectif <span className="font-display text-base text-foreground">{formatCurrency(detail.targetAmount)}</span>
              {targetLabel && <> · échéance {targetLabel}</>}
            </p>
          </div>
          <ProgressBar percent={progress * 100} color={barColor} />
          <p className="text-sm text-muted-foreground">
            {formatPercent(progress)} atteint
            {detail.monthlyContribution !== null && amountGreaterThan(detail.monthlyContribution, 0) && (
              <>
                {" · "}~<span className="font-display text-base text-foreground">{formatCurrency(detail.monthlyContribution)}</span> par mois
              </>
            )}
          </p>
        </section>

        <GoalDetailActions envelopeId={detail.id} balance={detail.balance} name={detail.name} />

        <section className="space-y-2">
          <h2 className="font-display text-xl">Transactions</h2>
          <TransactionList
            transactions={detail.transactions}
            empty={<p className="text-sm text-muted-foreground">Aucune transaction pour le moment.</p>}
          />
        </section>
      </div>
    );
  }

  const fillRatio = amountGreaterThan(detail.effectiveMonthlyBudget, 0) ? detail.totalFilled / detail.effectiveMonthlyBudget : 0;
  const overspent = amountGreaterThan(0, detail.balance);

  return (
    <div className="space-y-6">
      <DetailHeader title={title} subtitle={capitalizeFirst(getMonthLabel(month))} />

      <section className="space-y-3">
        <div>
          <p className="text-sm text-muted-foreground">Solde</p>
          <p className={cn("font-display text-[40px] leading-none tabular-nums", overspent && "text-spend")}>
            {formatCurrency(detail.balance)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Budget <span className="font-display text-base text-foreground">{formatCurrency(detail.effectiveMonthlyBudget)}</span>
            {" · "}Rempli <span className="font-display text-base text-foreground">{formatCurrency(detail.totalFilled)}</span>
            {" · "}Dépensé <span className="font-display text-base text-foreground">{formatCurrency(detail.totalSpent)}</span>
          </p>
          {detail.fillCadence === "WEEKLY" && (
            <p className="text-sm text-muted-foreground">
              <span className="font-display text-base text-foreground">{formatCurrency(detail.weeklyIndicator)}</span> par semaine
            </p>
          )}
        </div>
        <ProgressBar percent={Math.min(Math.max(fillRatio, 0), 1) * 100} color={barColor} />
        <p className="text-sm text-muted-foreground">{formatPercent(fillRatio)} du budget rempli</p>
      </section>

      <EnvelopeDetailActions envelopeId={detail.id} />

      {detail.weeklyBreakdown.map((week) => {
        const row = weekRowDisplay({ spent: week.spent, budget: week.budget, cadence: detail.fillCadence });
        return (
          <section key={week.week} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg">
                Semaine {week.week}
                <span className="ml-2 font-sans text-sm text-muted-foreground">{formatWeekSpan(week.start, week.end)}</span>
              </h2>
              <p className={cn("shrink-0 text-sm tabular-nums", row.over ? "text-spend" : "text-muted-foreground")}>
                {formatCurrency(week.spent)}
                {row.showQuota && <> sur {formatCurrency(week.budget)}</>}
              </p>
            </div>
            {row.showQuota && (
              <ProgressBar percent={row.percent} color={row.over ? "var(--color-spend)" : barColor} />
            )}
            <TransactionList transactions={week.transactions} />
          </section>
        );
      })}
    </div>
  );
}
