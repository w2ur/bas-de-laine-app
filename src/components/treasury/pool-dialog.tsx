"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { createTreasuryPool, deleteTreasuryPool, updateTreasuryPool } from "@/actions/treasury";
import { TREASURY_AVAILABILITY } from "@/lib/treasury-availability";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { toast } from "sonner";

interface Pool {
  id: string;
  name: string;
  availability: "IMMEDIATE" | "SHORT" | "LONG";
  amount: number;
}

interface PoolDialogProps {
  mode: "create" | "edit";
  pool?: Pool;
}

/** Add or edit an account in a bottom sheet; editing also holds « Supprimer le compte ». */
export function PoolDialog({ mode, pool }: PoolDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useFormDirty();

  function openSheet() {
    form.reset();
    setOpen(true);
  }

  async function handleSubmit(formData: FormData) {
    if (mode === "edit" && pool) {
      formData.set("id", pool.id);
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createTreasuryPool(formData)
          : await updateTreasuryPool(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(mode === "create" ? "Compte ajouté" : "Compte mis à jour");
      setOpen(false);
    });
  }

  async function handleDelete() {
    if (!pool) return;
    const result = await deleteTreasuryPool(pool.id);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Compte supprimé");
    setOpen(false);
  }

  return (
    <>
      {mode === "create" ? (
        <Button variant="ghost" className="h-11" onClick={openSheet}>
          <Plus className="size-4 mr-1" aria-hidden="true" />
          Ajouter
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-11 text-muted-foreground hover:text-foreground"
          aria-label={pool ? `Modifier le compte ${pool.name}` : "Modifier le compte"}
          onClick={openSheet}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={mode === "create" ? "Ajouter un compte" : "Modifier le compte"}
        dirty={form.dirty}
      >
        <form action={handleSubmit} onChange={form.markDirty} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pool-name">Nom</Label>
            <Input
              id="pool-name"
              name="name"
              placeholder="Ex: Compte courant, Livret A..."
              defaultValue={pool?.name}
              required
              className="h-11 text-base md:text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pool-availability">Disponibilité</Label>
            <Select name="availability" defaultValue={pool?.availability ?? "IMMEDIATE"} onValueChange={form.markDirty}>
              <SelectTrigger id="pool-availability" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TREASURY_AVAILABILITY.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <MoneyInput
            id="pool-amount"
            name="amount"
            label="Montant"
            defaultCents={pool ? Math.round(pool.amount * 100) : 0}
          />
          <Button type="submit" disabled={isPending} className="h-12 w-full text-base font-medium">
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === "create" ? (
              "Ajouter"
            ) : (
              "Enregistrer"
            )}
          </Button>
        </form>
        {mode === "edit" && pool && (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" className="mt-2 h-11 w-full text-foreground">
                Supprimer le compte
              </Button>
            }
            title="Supprimer ce compte ?"
            description={`Le compte « ${pool.name} » sera définitivement supprimé.`}
            onConfirm={handleDelete}
          />
        )}
      </BottomSheet>
    </>
  );
}
