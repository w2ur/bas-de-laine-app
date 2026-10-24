"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LedgerRow } from "@/components/ui/ledger-row";
import { useQuickSpend } from "@/components/envelopes/quick-spend-context";
import { envelopeRowMeta } from "@/lib/envelope-row-logic";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface EnvelopeData {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  fillCadence: "WEEKLY" | "MONTHLY";
  effectiveMonthlyBudget: number;
  weeklyIndicator: number;
  balance: number;
}

export function EnvelopeDetailLink({ id, name }: { id: string; name: string }) {
  return (
    <Link
      href={`/enveloppes/${id}`}
      aria-label={`Détail de ${name}`}
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <ChevronRight className="size-5" aria-hidden="true" />
    </Link>
  );
}

export function EnvelopeList({ envelopes }: { envelopes: EnvelopeData[] }) {
  const { open } = useQuickSpend();

  if (envelopes.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        Aucune enveloppe configurée. Allez dans{" "}
        <Link href="/configuration" className="underline underline-offset-2 hover:text-foreground">
          Configuration
        </Link>{" "}
        pour créer vos enveloppes.
      </p>
    );
  }

  return (
    <section className="space-y-2" aria-labelledby="envelopes-heading">
      <h2 id="envelopes-heading" className="font-display text-xl">
        Enveloppes
      </h2>
      <div className="rounded-xl border bg-card px-4">
        {envelopes.map((env) => {
          const row = envelopeRowMeta({
            balance: env.balance,
            reference: env.fillCadence === "MONTHLY" ? env.effectiveMonthlyBudget : env.weeklyIndicator,
            cadence: env.fillCadence,
          });
          return (
            <LedgerRow
              key={env.id}
              label={
                <>
                  <span className="sr-only">Dépenser depuis </span>
                  {env.icon} {env.name}
                </>
              }
              meta={<span className={cn(row.over && "text-spend")}>{row.meta}</span>}
              bar={{
                percent: row.percent,
                color: row.over ? "var(--color-spend)" : env.color || "var(--color-primary)",
              }}
              amount={formatCurrency(env.balance)}
              amountClassName={row.over ? "text-spend" : undefined}
              onPress={() => open(env.id, "SPEND")}
              trailing={<EnvelopeDetailLink id={env.id} name={env.name} />}
            />
          );
        })}
      </div>
    </section>
  );
}
