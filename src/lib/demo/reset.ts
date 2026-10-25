import type { Prisma, PrismaClient } from "@prisma/client";
import { buildDemoData, writeDemoData } from "../../../prisma/seed-demo";
import { demoDataRefusal } from "./guard";
import { demoEnvRefusal, isDemoMode } from "./mode";

/** Exit convention, portfolio-wide: 0 done · 1 a finding (refused) · 2 could not run. */
export type ResetExit = 0 | 1 | 2;

class Refusal extends Error {}

type Env = Record<string, string | undefined>;
type Log = (line: string) => void;

/**
 * Wipes the demo database and re-seeds it, after the same guard the app runs.
 *
 * Refuses (1) when ALLOWED_EMAILS is set or the database holds anything but the demo
 * household and user; could not run (2) without DEMO_MODE=1 or a database URL, or on
 * any database error. The table lock, the guard read, the TRUNCATE and the seed share
 * one transaction, so a refusal or a failed seed leaves the database as it was.
 */
export async function runDemoReset(opts: {
  env: Env;
  connect: (databaseUrl: string) => PrismaClient;
  today: Date;
  log: Log;
  error: Log;
}): Promise<ResetExit> {
  const { env, log, error } = opts;

  if (!isDemoMode(env)) {
    error("demo-reset: refused to run without DEMO_MODE=1, the explicit flag that this database is the demo's.");
    return 2;
  }
  const envRefusal = demoEnvRefusal(env);
  if (envRefusal) {
    error(`demo-reset: ${envRefusal}`);
    return 1;
  }
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    error("demo-reset: DATABASE_URL is not set.");
    return 2;
  }

  let prisma: PrismaClient | undefined;
  try {
    prisma = opts.connect(databaseUrl);
    const data = buildDemoData(opts.today);
    await prisma.$transaction(
      async (tx) => {
        // One lock, at the strength TRUNCATE needs, before the check: nothing can be
        // written or read between the check and the wipe, and no lock is upgraded
        // mid-transaction. The sorted order keeps two resets from deadlocking each
        // other, but a visitor's transaction can still hold a row lock the LOCK waits
        // on, or deadlock with it. lock_timeout bounds that wait: a timeout or a
        // deadlock aborts the whole transaction before any write, so that night's reset
        // exits 2 and the next night retries; the data is never touched.
        const tables = await appTables(tx);
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
        await tx.$executeRawUnsafe(`LOCK TABLE ${tables} IN ACCESS EXCLUSIVE MODE`);
        const refusal = await demoDataRefusal(tx);
        if (refusal) throw new Refusal(refusal);
        await tx.$executeRawUnsafe(`TRUNCATE ${tables}`);
        await writeDemoData(tx, data);
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
    log(`demo-reset: done, ${data.envelopes.length} envelopes and ${data.transactions.length} transactions written.`);
    return 0;
  } catch (cause) {
    if (cause instanceof Refusal) {
      error(`demo-reset: ${cause.message}`);
      return 1;
    }
    error(`demo-reset: could not run: ${describe(cause)}`);
    return 2;
  } finally {
    await prisma?.$disconnect();
  }
}

/** A refused connection surfaces as an error with an empty message and only a code. */
function describe(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  const code = (cause as { code?: unknown }).code;
  return [cause.name, code, cause.message].filter(Boolean).join(": ");
}

/** Every table of the schema but Prisma's migration ledger, derived rather than listed, sorted and quoted. */
async function appTables(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
    ORDER BY tablename`;
  if (rows.length === 0) throw new Error("no application table found: run the migrations first");
  return rows.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ");
}
