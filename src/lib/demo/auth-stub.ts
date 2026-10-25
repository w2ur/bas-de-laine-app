import type { NeonAuth } from "@neondatabase/auth/next/server";
import { DEMO_DISABLED_MESSAGE } from "./mode";

function off(name: string): never {
  throw new Error(`Neon Auth is off in DEMO_MODE (auth.${name} was called)`);
}

/**
 * Stand-in for the Neon Auth instance in demo mode. The auth API route is built at
 * module load (`auth.handler()`), so handler() answers 404; anything else that reaches
 * Neon Auth in demo mode is a bug, and throws rather than half-working.
 */
export function createDemoAuthStub(): NeonAuth {
  const notFound = async () => new Response(DEMO_DISABLED_MESSAGE, { status: 404 });
  const stub = {
    handler: () => ({ GET: notFound, POST: notFound, PUT: notFound, DELETE: notFound, PATCH: notFound }),
    middleware: () => off("middleware"),
    getSession: () => off("getSession"),
  };
  return stub as unknown as NeonAuth;
}
