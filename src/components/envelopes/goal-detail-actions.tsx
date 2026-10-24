"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ArrowRightLeft, X } from "lucide-react";
import { useQuickSpend } from "./quick-spend-context";
import { useTransfer } from "./transfer-context";
import { closeGoalEnvelope } from "@/actions/goals";
import { isZeroAmount } from "@/lib/money";
import { toast } from "sonner";

interface GoalDetailActionsProps {
  envelopeId: string;
  balance: number;
  name?: string;
}

/** « Remplir » is the goal page's one filled button; transfer and close sit under it. */
export function GoalDetailActions({ envelopeId, balance, name }: GoalDetailActionsProps) {
  const quickSpend = useQuickSpend();
  const transfer = useTransfer();
  const empty = isZeroAmount(balance);

  async function handleClose() {
    const result = await closeGoalEnvelope(envelopeId);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Objectif clôturé");
  }

  return (
    <div className="space-y-2">
      <Button className="h-12 w-full text-base font-medium" onClick={() => quickSpend.open(envelopeId, "FILL")}>
        Remplir
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" disabled={empty} onClick={() => transfer.open(envelopeId)}>
          <ArrowRightLeft className="size-4 mr-1" aria-hidden="true" />
          Transférer
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="h-11" disabled={!empty}>
              <X className="size-4 mr-1" aria-hidden="true" />
              Clôturer
            </Button>
          }
          title="Clôturer cet objectif ?"
          description={name ? `L'objectif « ${name} » sera clôturé.` : "Cet objectif sera clôturé."}
          confirmLabel="Clôturer"
          onConfirm={handleClose}
        />
      </div>
    </div>
  );
}
