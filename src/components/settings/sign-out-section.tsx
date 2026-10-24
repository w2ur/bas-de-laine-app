"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { signOutAndPurge } from "@/lib/auth/sign-out";

export function SignOutSection({ email }: { email: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await signOutAndPurge();
      // No reset on success: signOutAndPurge() ends with a full page load, and the
      // button must stay disabled for the whole transition.
    } catch {
      toast.error("La déconnexion a échoué, réessayez");
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <Separator />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connecté en tant que <span className="text-foreground">{email}</span>
          </p>
          <Button variant="outline" onClick={handleSignOut} disabled={loading}>
            <LogOut className="mr-2 size-4" />
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
