import { DEMO_HOUSEHOLD_ID, DEMO_USER, demoEnvRefusal } from "./mode";

type Env = Record<string, string | undefined>;

/** The two reads the guard needs; the Prisma client and the reset script's both fit. */
export interface DemoGuardDb {
  household: { findFirst(args: { where: { id: { not: string } }; select: { id: true } }): Promise<{ id: string } | null> };
  user: { findFirst(args: { where: { id: { not: string } }; select: { id: true } }): Promise<{ id: string } | null> };
}

/**
 * The database half of the guard: a reason to refuse, or null. Any household or user
 * other than the fixed demo pair means real data, and demo mode serves it unauthenticated.
 * An empty database passes (the demo household is created on first use).
 */
export async function demoDataRefusal(db: DemoGuardDb): Promise<string | null> {
  const foreignHousehold = await db.household.findFirst({
    where: { id: { not: DEMO_HOUSEHOLD_ID } },
    select: { id: true },
  });
  if (foreignHousehold) {
    return "DEMO_MODE=1 refused: the database holds a household other than the demo one. Point DATABASE_URL at a demo-only database.";
  }
  const foreignUser = await db.user.findFirst({
    where: { id: { not: DEMO_USER.id } },
    select: { id: true },
  });
  if (foreignUser) {
    return "DEMO_MODE=1 refused: the database holds a user other than the demo one. Point DATABASE_URL at a demo-only database.";
  }
  return null;
}

/** A real refusal (the env or the rows say "not a demo"), as opposed to a failed query. */
export class DemoRefusal extends Error {
  override name = "DemoRefusal";
}

/**
 * Recognises a refusal by its name, not by instanceof: instrumentation and the app
 * can be bundled with separate copies of this module, and a refusal from either copy
 * must still be refused.
 */
export function isDemoRefusal(error: unknown): boolean {
  return error instanceof Error && error.name === "DemoRefusal";
}

/**
 * A Prisma known-request error (P2xxx: a missing table, a constraint, a bad query).
 * Unlike a connection problem, no retry fixes it, so it must stop a demo at startup.
 */
export function isPrismaRequestError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^P2\d{3}$/.test(code);
}

/**
 * Throws a DemoRefusal unless both halves of the guard pass; a database error is
 * rethrown as it is. The env half runs first, without a query.
 */
export async function assertDemoSafe(db: DemoGuardDb, env: Env = process.env): Promise<void> {
  const refusal = demoEnvRefusal(env) ?? (await demoDataRefusal(db));
  if (refusal) throw new DemoRefusal(refusal);
}
