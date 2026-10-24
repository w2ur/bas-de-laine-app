"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { formatDateShort } from "@/lib/format";
import { filterPendingFillRows, type FillPlanRow, type FinancialWeek } from "@/lib/week-logic";
import { FillWeekSheet } from "./fill-week-sheet";

interface FillWeekRitualProps {
  plan: { week: FinancialWeek; rows: FillPlanRow[]; mondayDate: string };
}

export function FillWeekRitual({ plan }: FillWeekRitualProps) {
  const [open, setOpen] = useState(false);
  // Radix's controlled Dialog only calls onOpenChange for Esc/overlay/X, never
  // for this parent-driven open — so the sheet can't reset its own state on
  // that edge. Bumping the key forces a fresh <FillWeekSheet> instance on
  // every open, whose useState(initial) reads the just-refreshed `plan.rows`
  // (the element stays mounted while closing, so the close animation is
  // unaffected).
  const [openKey, setOpenKey] = useState(0);
  const week = { ...plan.week, monday: new Date(plan.week.monday), sunday: new Date(plan.week.sunday) };

  if (plan.rows.length === 0) return null;

  const pending = filterPendingFillRows(plan.rows);
  const hasMonthly = pending.some((r) => r.cadence === "MONTHLY");

  if (pending.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Semaine remplie · {formatDateShort(week.monday)}
      </p>
    );
  }

  return (
    <>
      <Button
        className="w-full"
        size="lg"
        onClick={() => {
          setOpenKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Sparkles className="size-4 mr-2" aria-hidden="true" />
        {hasMonthly && week.index === 1 ? "Remplir la semaine et le mois" : "Remplir la semaine"}
      </Button>
      <FillWeekSheet key={openKey} open={open} onOpenChange={setOpen} week={week} rows={plan.rows} mondayDate={plan.mondayDate} />
    </>
  );
}
