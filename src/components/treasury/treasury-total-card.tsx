"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { formatCurrency, formatInstantShort } from "@/lib/format";
import { amountGreaterThan, amountsEqual } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { setTreasuryBalance, deductFromTreasury } from "@/actions/treasury";
import { Pencil, Minus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RefreshButton } from "./refresh-button";

interface TreasuryTotalCardProps {
  balance: number;
  poolsTotal: number | null;
  lastUpdate: Date | null;
  stale: boolean;
}

export function TreasuryTotalCard({
  balance,
  poolsTotal,
  lastUpdate,
  stale,
}: TreasuryTotalCardProps) {
  const [setOpen, setSetOpen] = useState(false);
  const [deductOpen, setDeductOpen] = useState(false);
  const [isSetPending, startSetTransition] = useTransition();
  const [isDeductPending, startDeductTransition] = useTransition();
  const setForm = useFormDirty();
  const deductForm = useFormDirty();

  async function handleSet(formData: FormData) {
    startSetTransition(async () => {
      const result = await setTreasuryBalance(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Solde mis à jour");
      setSetOpen(false);
    });
  }

  async function handleDeduct(formData: FormData) {
    startDeductTransition(async () => {
      const result = await deductFromTreasury(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Déduction effectuée");
      setDeductOpen(false);
    });
  }

  return (
    <section className="space-y-4" aria-labelledby="treasury-total-label">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p id="treasury-total-label" className="text-sm text-muted-foreground">
            Total trésorerie
          </p>
          <div className="-mr-2 flex">
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground hover:text-foreground"
              title="Définir le solde"
              aria-label="Définir le solde"
              onClick={() => {
                setForm.reset();
                setSetOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground hover:text-foreground"
              title="Déduire un montant"
              aria-label="Déduire un montant"
              onClick={() => {
                deductForm.reset();
                setDeductOpen(true);
              }}
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <p
          className={cn(
            "font-display text-[40px] leading-none tabular-nums",
            amountGreaterThan(0, balance) && "text-spend",
          )}
        >
          {formatCurrency(balance)}
        </p>
        <div className="mt-2 text-sm">
          {poolsTotal !== null && !amountsEqual(balance, poolsTotal) && (
            <p className="text-muted-foreground">
              Écart de {formatCurrency(balance - poolsTotal)} avec vos comptes
            </p>
          )}
          {lastUpdate && (
            <p className={stale ? "text-foreground font-medium" : "text-muted-foreground"}>
              Mis à jour le {formatInstantShort(lastUpdate)}
              {stale && " · à rafraîchir"}
            </p>
          )}
        </div>
      </div>
      {poolsTotal !== null && <RefreshButton />}

      <BottomSheet open={setOpen} onOpenChange={setSetOpen} title="Définir le solde" dirty={setForm.dirty}>
        <form action={handleSet} onChange={setForm.markDirty} className="space-y-4">
          <MoneyInput
            id="balance"
            name="balance"
            label="Nouveau solde"
            defaultCents={Math.round(balance * 100)}
          />
          <div className="space-y-2">
            <Label htmlFor="set-label">Libellé (optionnel)</Label>
            <Input id="set-label" name="label" className="h-11 text-base md:text-sm" />
          </div>
          <Button type="submit" disabled={isSetPending} className="h-12 w-full text-base font-medium">
            {isSetPending ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
          </Button>
        </form>
      </BottomSheet>

      <BottomSheet open={deductOpen} onOpenChange={setDeductOpen} title="Déduire un montant" dirty={deductForm.dirty}>
        <form action={handleDeduct} onChange={deductForm.markDirty} className="space-y-4">
          <MoneyInput id="deduct-amount" name="amount" label="Montant" required />
          <div className="space-y-2">
            <Label htmlFor="deduct-label">Libellé</Label>
            <Input id="deduct-label" name="label" required className="h-11 text-base md:text-sm" />
          </div>
          <Button type="submit" disabled={isDeductPending} className="h-12 w-full text-base font-medium">
            {isDeductPending ? <Loader2 className="size-4 animate-spin" /> : "Déduire"}
          </Button>
        </form>
      </BottomSheet>
    </section>
  );
}
