"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/ui/money-input";
import { formatCurrency } from "@/lib/format";
import { fillWeekChangedNotice, fillWeekStaleNotice } from "@/lib/labels";
import { formatWeekLabel, type FillPlanRow, type FinancialWeek } from "@/lib/week-logic";
import { fillWeek } from "@/actions/envelopes";
import { cn } from "@/lib/utils";

interface FillWeekSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  week: FinancialWeek;
  rows: FillPlanRow[];
  /** "yyyy-MM-dd", server-derived from week.monday (see getFillPlan) — never
   * reconstructed client-side, so the viewer's timezone can't shift the date. */
  mondayDate: string;
}

interface RowState {
  checked: boolean;
  cents: number;
}

function toCents(euros: number): number {
  return Math.round(euros * 100);
}

export function FillWeekSheet({ open, onOpenChange, week, rows, mondayDate }: FillWeekSheetProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initial = useMemo(
    () =>
      Object.fromEntries(
        rows.map((r) => [
          r.id,
          {
            checked: !r.alreadyFilled,
            // An already-filled row proposes the top-up, not a second full fill (spec §3).
            cents: toCents(r.alreadyFilled ? Math.max(r.amount - r.filledAmount, 0) : r.amount),
          },
        ])
      ) as Record<string, RowState>,
    [rows]
  );
  const [state, setState] = useState<Record<string, RowState>>(initial);

  const edited = rows.some((r) => {
    const s = state[r.id];
    return s !== undefined && (s.checked !== initial[r.id].checked || s.cents !== initial[r.id].cents);
  });
  const checkedRows = rows.filter((r) => state[r.id]?.checked);
  const totalCents = checkedRows.reduce((sum, r) => sum + (state[r.id]?.cents ?? 0), 0);
  const canSubmit = checkedRows.length > 0 && checkedRows.every((r) => (state[r.id]?.cents ?? 0) > 0);

  function update(id: string, patch: Partial<RowState>) {
    setState((s) => ({ ...s, [id]: { ...(s[id] ?? initial[id]), ...patch } }));
  }

  function submit() {
    startTransition(async () => {
      const result = await fillWeek({
        date: mondayDate,
        fills: checkedRows.map((r) => ({
          envelopeId: r.id,
          amount: state[r.id].cents / 100,
          // The server only writes if the current sum still matches this —
          // the idempotency key that lets a genuine top-up through while
          // still dropping a stale resubmission (7492dbc).
          expectedFilledAmount: r.filledAmount,
        })),
      });
      if (result.error) {
        if (result.stale) {
          // The plan is not this week's (sheet left open from last week, or
          // confirmed just after midnight on Monday). Reopening would show the
          // same stale rows and fail again, so reload the plan instead.
          toast.error(fillWeekStaleNotice(result.error));
          onOpenChange(false);
          router.refresh();
          return;
        }
        toast.error(result.error);
        return;
      }
      const dropped = result.droppedCount ?? 0;
      if (dropped === 0) {
        toast.success("Semaine remplie");
      } else if (dropped === checkedRows.length) {
        // Nothing was written: every row's expected state had already
        // changed since the page loaded (d4b6f80 — the
        // cause could be a fill added or deleted elsewhere, or a second tab
        // on this same device; the copy no longer guesses which).
        toast.error(fillWeekChangedNotice(dropped));
      } else {
        toast.success(`Semaine partiellement remplie. ${fillWeekChangedNotice(dropped)}`);
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Remplir la semaine"
      description={formatWeekLabel(week)}
      dirty={edited}
    >

        <ul className="space-y-3">
          {rows.map((r) => {
            const s = state[r.id] ?? initial[r.id];
            return (
              <li key={r.id} className={cn("flex items-start gap-3", !s.checked && "opacity-60")}>
                <Checkbox
                  id={`fill-${r.id}`}
                  checked={s.checked}
                  onCheckedChange={(c) => update(r.id, { checked: c === true })}
                  className="mt-3"
                />
                <div className="flex-1 min-w-0">
                  <label htmlFor={`fill-${r.id}`} className="flex items-center gap-1 text-sm font-medium">
                    <span className="truncate">{r.icon ? `${r.icon} ` : ""}{r.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{r.cadence === "MONTHLY" ? "/mois" : "/sem"}</span>
                    {r.late && <span className="shrink-0 text-[11px] font-medium text-foreground">en retard</span>}
                  </label>
                  {r.alreadyFilled && (
                    <p className="text-[11px] text-muted-foreground">déjà rempli : {formatCurrency(r.filledAmount)}</p>
                  )}
                </div>
                <div className="w-32">
                  <MoneyInput
                    name={`amount-${r.id}`}
                    label={`Montant pour ${r.name}`}
                    srOnly
                    cents={s.cents}
                    onCentsChange={(cents) => update(r.id, { cents })}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 space-y-3">
          <p className="flex items-baseline justify-between text-sm">
            Total
            <span className="font-display text-xl tabular-nums">{formatCurrency(totalCents / 100)}</span>
          </p>
          <Button
            type="button"
            onClick={submit}
            disabled={!canSubmit || isPending}
            className="h-12 w-full text-base font-medium"
          >
            {isPending && <Loader2 className="size-4 mr-2 animate-spin" aria-hidden="true" />}
            Remplir
          </Button>
        </div>
    </BottomSheet>
  );
}
