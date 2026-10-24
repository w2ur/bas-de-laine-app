import type { Metadata } from "next";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Connexion · Bas de Laine",
  description: "Connexion à Bas de Laine avec un code reçu par e-mail",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="font-display text-4xl">Bas de Laine</h1>
          <p className="text-muted-foreground text-sm">Connexion par code e-mail</p>
        </header>
        <SignInForm />
      </div>
    </main>
  );
}
