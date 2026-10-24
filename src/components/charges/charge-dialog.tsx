"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import { createCharge, deleteCharge, updateCharge } from "@/actions/charges";
import { formatCurrency } from "@/lib/format";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ChargeDialogProps {
  charge?: {
    id: string;
    name: string;
    amount: number;
    dayOfMonth: number;
    active: boolean;
  };
}

/** Add or edit a recurring charge in a bottom sheet; editing also holds « Supprimer ». */
export function ChargeDialog({ charge }: ChargeDialogProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(charge?.active ?? true);
  const isEditing = !!charge;
  const [isPending, startTransition] = useTransition();
  const form = useFormDirty();

  function openSheet() {
    // Re-read the charge each time: the row's switch can pause it while this
    // component stays mounted, and a stale value would be saved back.
    setActive(charge?.active ?? true);
    form.reset();
    setOpen(true);
  }

  async function handleSubmit(formData: FormData) {
    formData.set("active", active ? "true" : "false");

    startTransition(async () => {
      const result = isEditing
        ? await updateCharge(charge.id, formData)
        : await createCharge(formData);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(isEditing ? "Charge modifiée" : "Charge ajoutée");
      setOpen(false);
    });
  }

  async function handleDelete() {
    if (!charge) return;
    const result = await deleteCharge(charge.id);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Charge supprimée");
    setOpen(false);
  }

  return (
    <>
      {isEditing ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-11 text-muted-foreground hover:text-foreground"
          aria-label={`Modifier la charge ${charge.name}`}
          onClick={openSheet}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      ) : (
        <Button variant="ghost" className="h-11" onClick={openSheet}>
          <Plus className="size-4 mr-1" aria-hidden="true" />
          Ajouter
        </Button>
      )}
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={isEditing ? "Modifier la charge" : "Nouvelle charge fixe"}
        dirty={form.dirty}
      >
        <form action={handleSubmit} onChange={form.markDirty} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" defaultValue={charge?.name ?? ""} required className="h-11 text-base md:text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <MoneyInput
              name="amount"
              label="Montant mensuel"
              defaultCents={charge ? Math.round(charge.amount * 100) : 0}
              required
            />
            <div className="space-y-2">
              <Label htmlFor="dayOfMonth">Jour du mois</Label>
              <Input
                id="dayOfMonth"
                name="dayOfMonth"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                defaultValue={charge?.dayOfMonth ?? 1}
                required
                className="text-base md:text-sm"
              />
            </div>
          </div>
          <div className="flex min-h-11 items-center gap-3">
            <Switch
              id="active"
              checked={active}
              onCheckedChange={(checked) => {
                setActive(checked);
                form.markDirty();
              }}
            />
            <Label htmlFor="active">Active</Label>
          </div>
          <Button type="submit" disabled={isPending} className="h-12 w-full text-base font-medium">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : isEditing ? "Enregistrer" : "Ajouter"}
          </Button>
        </form>
        {isEditing && (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" className="mt-2 h-11 w-full text-foreground">
                Supprimer la charge
              </Button>
            }
            title="Supprimer cette charge ?"
            description={`La charge « ${charge.name} » (${formatCurrency(charge.amount)}) sera définitivement supprimée.`}
            onConfirm={handleDelete}
          />
        )}
      </BottomSheet>
    </>
  );
}
