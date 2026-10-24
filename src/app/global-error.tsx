"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
        <h2 className="text-xl font-semibold">Une erreur est survenue</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Quelque chose s&apos;est mal passé. Veuillez réessayer ou vous déconnecter en
          vidant les données du site dans les réglages de votre navigateur.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">Code&nbsp;: {error.digest}</p>
        )}
        <Button onClick={reset}>Réessayer</Button>
      </body>
    </html>
  );
}
