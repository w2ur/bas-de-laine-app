"use client";

import { useRef, useState, useTransition } from "react";
import { MAX_CENTS, useCentsInput } from "@/hooks/use-cents-input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Loader2 } from "lucide-react";
import { useTransfer } from "./transfer-context";
import { transferBetweenEnvelopes } from "@/actions/transfers";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TransferEnvelope {
  id: string;
  name: string;
  icon: string | null;
  type: "BUDGET" | "GOAL";
  balance: number;
  targetAmount?: number;
}

interface TransferSheetProps {
  envelopes: TransferEnvelope[];
}

const AMOUNT_INPUT_ID = "transfer-amount";

export function TransferSheet({ envelopes }: TransferSheetProps) {
  const { isOpen, sourceId, close } = useTransfer();
  const formRef = useRef<HTMLFormElement>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const { cents, setCents, reset: resetCents } = useCentsInput();
  const [isPending, startTransition] = useTransition();

  const source = envelopes.find((e) => e.id === sourceId);
  const destinations = envelopes.filter((e) => e.id !== sourceId);

  function resetState() {
    resetCents();
    setDestinationId(null);
  }

  async function handleSubmit(formData: FormData) {
    if (!sourceId) {
      toast.error("Enveloppe source manquante");
      return;
    }
    if (!destinationId) {
      toast.error("Veuillez choisir une destination");
      return;
    }
    if (cents === 0) {
      toast.error("Veuillez saisir un montant");
      return;
    }

    formData.set("sourceId", sourceId);
    formData.set("destinationId", destinationId);

    startTransition(async () => {
      const result = await transferBetweenEnvelopes(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Transfert effectué");
      formRef.current?.reset();
      resetState();
      close();
    });
  }

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) {
          close();
          resetState();
        }
      }}
      title={source ? `${source.icon ?? ""} ${source.name} → Transfert`.trim() : "Transfert"}
      description={source ? `Solde : ${formatCurrency(source.balance)}` : "Choisissez une enveloppe source"}
      dirty={cents > 0}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        document.getElementById(AMOUNT_INPUT_ID)?.focus();
      }}
    >
      <form ref={formRef} action={handleSubmit} className="space-y-4">
        {/* Amount first — card-machine style auto-decimal */}
        <MoneyInput
          id={AMOUNT_INPUT_ID}
          name="amount"
          label="Montant"
          srOnly
          size="lg"
          maxCents={MAX_CENTS}
          cents={cents}
          onCentsChange={setCents}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm text-muted-foreground">Destination</legend>
          <div className="flex flex-wrap gap-2">
            {destinations.map((env) => {
              const remaining =
                env.type === "GOAL" && env.targetAmount != null
                  ? env.targetAmount - env.balance
                  : null;

              return (
                <button
                  key={env.id}
                  type="button"
                  disabled={isPending}
                  aria-pressed={destinationId === env.id}
                  onClick={() => setDestinationId(env.id)}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-sm transition-colors duration-100",
                    destinationId === env.id
                      ? "border-primary bg-primary/10 text-foreground font-medium"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {env.icon} {env.name}
                  {remaining != null && remaining > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (max {formatCurrency(remaining)})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Input
          name="description"
          placeholder="Description (optionnel)"
          className="h-11 text-base md:text-sm"
        />

        <Button
          type="submit"
          disabled={isPending || !destinationId || cents === 0}
          className="w-full h-12 text-base font-medium"
        >
          {isPending ? <Loader2 className="size-5 animate-spin" /> : "Transférer"}
        </Button>
      </form>
    </BottomSheet>
  );
}
