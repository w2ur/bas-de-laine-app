/**
 * DEMO_MODE: a public, sign-in-free demo over a database holding one fictional
 * household. Everything here is env-only (no Prisma), so the proxy can import it.
 *
 * Demo mode turns the auth gate off, so it must never run over a real household:
 * `demoEnvRefusal` (here) and `assertDemoSafe` (./guard.ts) are the two hard guards.
 */

type Env = Record<string, string | undefined>;

/** Exactly "1" turns demo mode on; any other value, or none, leaves the app as it was. */
export function isDemoMode(env: Env = process.env): boolean {
  return env.DEMO_MODE === "1";
}

/** Fixed identity of the demo. The seed and the nightly reset write these same rows. */
export const DEMO_HOUSEHOLD_ID = "demo-household";
export const DEMO_USER = {
  id: "demo-user",
  // A fixed UUID: the column is @db.Uuid, and nothing ever compares it with Neon Auth.
  neonAuthId: "00000000-0000-4000-8000-00000000d3e0",
  name: "Camille (démo)",
  email: "demo@bas-de-laine.invalid",
} as const;

export const DEMO_BANNER_TEXT = "Démo — données fictives, remises à zéro chaque nuit";
export const DEMO_DISABLED_MESSAGE = "Désactivé dans la démo";
export const DEMO_IMPORT_DISABLED = "L'import est désactivé dans la démo : les données sont communes à tous les visiteurs.";
export const DEMO_SIGN_OUT_DISABLED = "La démo n'a pas de compte : la déconnexion est désactivée.";

/**
 * The env half of the guard: a reason to refuse, or null.
 *
 * A non-empty ALLOWED_EMAILS means the deployment was configured for a real family;
 * turning the gate off there would hand their budget to anyone with the URL.
 */
export function demoEnvRefusal(env: Env = process.env): string | null {
  if ((env.ALLOWED_EMAILS ?? "").trim() !== "") {
    return "DEMO_MODE=1 refused: ALLOWED_EMAILS is set, so this deployment serves a real household. Unset one of the two.";
  }
  return null;
}
