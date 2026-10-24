"use client";

import { useState, useTransition } from "react";
import { Slot } from "radix-ui";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Plus, Loader2 } from "lucide-react";
import { createGoalEnvelope } from "@/actions/goals";
import { toast } from "sonner";

interface CreateGoalDialogProps {
  trigger?: React.ReactNode;
}

export function CreateGoalDialog({ trigger }: CreateGoalDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createGoalEnvelope(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Objectif créé");
      setOpen(false);
    });
  }

  return (
    <>
      <Slot.Root onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button variant="ghost" className="h-11">
            <Plus className="size-4 mr-1" aria-hidden="true" />
            Nouveau
          </Button>
        )}
      </Slot.Root>
      <BottomSheet open={open} onOpenChange={setOpen} title="Nouvel objectif">
        <form action={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-name">Nom</Label>
            <Input id="goal-name" name="name" required className="h-11 text-base md:text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <MoneyInput
              id="goal-target"
              name="targetAmount"
              label="Montant cible"
              required
            />
            <div className="space-y-2">
              <Label htmlFor="goal-icon">Icône</Label>
              <Input id="goal-icon" name="icon" placeholder="🎯" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal-date">Date cible</Label>
              <Input id="goal-date" name="targetDate" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-color">Couleur</Label>
              <Input
                id="goal-color"
                name="color"
                type="color"
                defaultValue="#448061"
              />
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="h-12 w-full text-base font-medium">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
          </Button>
        </form>
      </BottomSheet>
    </>
  );
}
