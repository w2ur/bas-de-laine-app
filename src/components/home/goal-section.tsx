"use client";

import { LedgerRow } from "@/components/ui/ledger-row";
import { CreateGoalDialog } from "@/components/envelopes/create-goal-dialog";
import { useQuickSpend } from "@/components/envelopes/quick-spend-context";
import { EnvelopeDetailLink } from "./envelope-list";
import { formatCurrency } from "@/lib/format";

interface GoalData {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  targetAmount: number;
  targetDate: Date | null;
  balance: number;
  progress: number;
}

interface GoalSectionProps {
  goals: GoalData[];
}

function goalMeta(goal: GoalData): string {
  const parts = [`objectif ${formatCurrency(goal.targetAmount)}`];
  if (goal.targetDate) {
    parts.push(new Date(goal.targetDate).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  }
  return parts.join(" · ");
}

export function GoalSection({ goals }: GoalSectionProps) {
  const { open } = useQuickSpend();

  return (
    <section className="space-y-2" aria-labelledby="goals-heading">
      <div className="flex items-center justify-between">
        <h2 id="goals-heading" className="font-display text-xl">
          Objectifs
        </h2>
        <CreateGoalDialog />
      </div>
      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Aucun objectif pour le moment
        </p>
      ) : (
        <div className="rounded-xl border bg-card px-4">
          {goals.map((goal) => (
            <LedgerRow
              key={goal.id}
              label={
                <>
                  <span className="sr-only">Remplir </span>
                  {goal.icon} {goal.name}
                </>
              }
              meta={goalMeta(goal)}
              bar={{
                percent: Math.min(Math.max(goal.progress * 100, 0), 100),
                color: goal.color || "var(--color-primary)",
              }}
              amount={formatCurrency(goal.balance)}
              onPress={() => open(goal.id, "FILL")}
              trailing={<EnvelopeDetailLink id={goal.id} name={goal.name} />}
            />
          ))}
        </div>
      )}
    </section>
  );
}
