"use client";

import { Button } from "@/components/ui/button";
import { Plus, ArrowRightLeft } from "lucide-react";
import { useQuickSpend } from "./quick-spend-context";
import { useTransfer } from "./transfer-context";

interface EnvelopeDetailActionsProps {
  envelopeId: string;
}

/** « Dépenser » is the page's one filled button; fill and transfer sit under it. */
export function EnvelopeDetailActions({ envelopeId }: EnvelopeDetailActionsProps) {
  const quickSpend = useQuickSpend();
  const transfer = useTransfer();

  return (
    <div className="space-y-2">
      <Button
        className="h-12 w-full bg-spend text-base font-medium text-white hover:bg-spend/90 dark:text-background"
        onClick={() => quickSpend.open(envelopeId, "SPEND")}
      >
        Dépenser
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={() => quickSpend.open(envelopeId, "FILL")}>
          <Plus className="size-4 mr-1" aria-hidden="true" />
          Remplir
        </Button>
        <Button variant="outline" className="h-11" onClick={() => transfer.open(envelopeId)}>
          <ArrowRightLeft className="size-4 mr-1" aria-hidden="true" />
          Transférer
        </Button>
      </div>
    </div>
  );
}
