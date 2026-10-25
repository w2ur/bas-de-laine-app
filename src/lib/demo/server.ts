import { cache } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertDemoSafe } from "./guard";
import { DEMO_HOUSEHOLD_ID, DEMO_USER } from "./mode";

let verified: Promise<void> | null = null;

/**
 * Runs the guard once per server process and remembers only a pass: a refusal is
 * re-checked (and re-thrown) on every call, so a misconfigured demo never serves.
 * Called from instrumentation.ts at startup and from getDemoHousehold() on every
 * request, which is the gate that holds even where startup hooks are skipped.
 */
export function ensureDemoSafe(): Promise<void> {
  verified ??= assertDemoSafe(prisma).catch((error: unknown) => {
    verified = null;
    throw error;
  });
  return verified;
}

/** Test hook: forget a remembered pass. */
export function resetDemoGuardForTests() {
  verified = null;
}

let provisioning: Promise<void> | null = null;

/**
 * Creates the demo household and user where missing. The layout and the page both
 * ask on the first request, so concurrent callers in a process share one run, and
 * ON CONFLICT DO NOTHING (skipDuplicates) covers a second process doing the same.
 */
async function provisionDemoIdentity(): Promise<void> {
  await prisma.household.createMany({ data: [{ id: DEMO_HOUSEHOLD_ID }], skipDuplicates: true });
  await prisma.user.createMany({ data: [{ ...DEMO_USER, householdId: DEMO_HOUSEHOLD_ID }], skipDuplicates: true });
}

/**
 * getHousehold() in demo mode: no session, the fixed demo user and household, both
 * created on first use. Same shape as the real getHousehold(). One query (the user
 * with its household), deduplicated per request by cache(): the layout and the page
 * both ask.
 */
export const getDemoHousehold = cache(async () => {
  // No cookie is read in demo mode, so without this Next.js would try to prerender
  // the (app) pages at build time, against the database, and serve them frozen.
  await connection();
  await ensureDemoSafe();

  const withHousehold = { where: { id: DEMO_USER.id }, include: { household: true } } as const;
  let row = await prisma.user.findUnique(withHousehold);
  if (!row) {
    provisioning ??= provisionDemoIdentity().finally(() => {
      provisioning = null;
    });
    await provisioning;
    row = await prisma.user.findUniqueOrThrow(withHousehold);
  }

  const { household, ...user } = row;
  return { user, household, householdId: household.id };
});
