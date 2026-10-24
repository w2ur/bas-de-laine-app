"use client";

import { useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyInput } from "@/components/ui/money-input";
import { Button } from "@/components/ui/button";
import { updateIncome } from "@/actions/budgets";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface IncomeFormProps {
  currentIncome: number;
}

export function IncomeForm({ currentIncome }: IncomeFormProps) {
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateIncome(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Revenu mis à jour");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenus mensuels</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="flex gap-4 items-end">
          <div className="flex-1">
            <MoneyInput
              id="income"
              name="income"
              label="Revenu net mensuel"
              defaultCents={Math.round(currentIncome * 100)}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
