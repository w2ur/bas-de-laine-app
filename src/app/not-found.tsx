import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="font-display text-6xl text-muted-foreground">404</h1>
      <p className="text-xl text-muted-foreground">Page non trouvée</p>
      <Button asChild>
        <Link href="/enveloppes">Retour aux enveloppes</Link>
      </Button>
    </div>
  );
}
