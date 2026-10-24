"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { refreshTreasuryTotal } from "@/actions/treasury";
import { toast } from "sonner";

export function RefreshButton() {
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(async () => {
      try {
        const result = await refreshTreasuryTotal();
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Total synchronisé avec vos comptes");
      } catch {
        toast.error("Erreur lors de la synchronisation");
      }
    });
  }

  return (
    <Button
      variant="outline"
      className="h-11"
      onClick={handleRefresh}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin mr-1" />
      ) : (
        <RefreshCw className="size-4 mr-1" />
      )}
      Rafraîchir le total
    </Button>
  );
}
