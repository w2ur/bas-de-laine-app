"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <AlertCircle className="size-12 text-destructive" />
      <h2 className="text-xl font-semibold">Une erreur est survenue</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Quelque chose s&apos;est mal passé. Veuillez réessayer.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">Code&nbsp;: {error.digest}</p>
      )}
      <div className="flex gap-3">
        <Button onClick={reset}>Réessayer</Button>
        <Button variant="outline" asChild>
          <Link href="/enveloppes">Retour aux enveloppes</Link>
        </Button>
      </div>
      <Button variant="link" asChild>
        <Link href="/auth/sign-in">Se connecter avec un autre compte</Link>
      </Button>
    </div>
  );
}
