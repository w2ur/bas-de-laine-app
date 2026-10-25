/**
 * Runs once when a server instance starts (`next start`, the standalone server, and
 * each Vercel function instance); skipped during `next build`.
 *
 * DEMO_MODE fails closed here: a refusal from the demo guard stops the instance
 * before it serves. getHousehold() runs the same guard on every request, so the
 * demo stays closed even where this hook does not run or its failure is swallowed.
 *
 * Next.js keeps a rejected register() for the life of the process, so throwing on a
 * database that is merely unreachable at boot would leave the demo answering 500
 * until a restart. Only a refusal (matched by name) or a Prisma schema/query error
 * (P2xxx) is thrown; anything else is logged, and the per-request check in
 * getHousehold() decides once the database answers.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { isDemoMode } = await import("@/lib/demo/mode");
  if (!isDemoMode()) return;

  const [{ ensureDemoSafe }, { isDemoRefusal, isPrismaRequestError }] = await Promise.all([
    import("@/lib/demo/server"),
    import("@/lib/demo/guard"),
  ]);
  try {
    await ensureDemoSafe();
  } catch (error) {
    // A refusal or a schema/query error (P2xxx) stops the instance; anything else (an
    // unreachable or starting database, a code-less error) is logged, and getHousehold()
    // still fails closed on every request until the guard passes.
    if (isDemoRefusal(error) || isPrismaRequestError(error)) throw error;
    console.error("DEMO_MODE: the demo guard could not run at startup; getHousehold() will check on every request.", error);
  }
}
