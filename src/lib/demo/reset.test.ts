import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { runDemoReset } from "./reset";
import { DEMO_HOUSEHOLD_ID, DEMO_USER } from "./mode";

/** A fake client whose transaction records what it would have done. */
function fakeDb({ households = [] as string[], users = [] as string[], tables = ["households", "users"], fail = null as Error | null } = {}) {
  const calls: string[] = [];
  const pick = (ids: string[], name: string) => async ({ where }: { where: { id: { not: string } } }) => {
    calls.push(`check ${name}`);
    const id = ids.find((candidate) => candidate !== where.id.not);
    return id ? { id } : null;
  };
  const model = (name: string) => ({
    createMany: vi.fn(async () => {
      calls.push(`createMany ${name}`);
      if (fail) throw fail;
    }),
    update: vi.fn(async () => calls.push(`update ${name}`)),
  });
  const tx = {
    household: { findFirst: pick(households, "household"), ...model("household") },
    user: { findFirst: pick(users, "user"), ...model("user") },
    envelope: model("envelope"),
    envelopeTransaction: model("envelopeTransaction"),
    recurringCharge: model("recurringCharge"),
    treasury: model("treasury"),
    treasuryAdjustment: model("treasuryAdjustment"),
    treasuryPool: model("treasuryPool"),
    $queryRaw: vi.fn(async () => tables.map((tablename) => ({ tablename }))),
    $executeRawUnsafe: vi.fn(async (sql: string) => calls.push(sql)),
  };
  const client = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    $disconnect: vi.fn(async () => {}),
  };
  return { client: client as unknown as PrismaClient, calls, raw: client, tx };
}

async function run(env: Record<string, string | undefined>, db = fakeDb()) {
  const errors: string[] = [];
  const code = await runDemoReset({
    env,
    connect: () => db.client,
    today: new Date(Date.UTC(2026, 9, 25)),
    log: () => {},
    error: (line) => errors.push(line),
  });
  return { code, errors, db };
}

const demoEnv = { DEMO_MODE: "1", DATABASE_URL: "postgres://demo" };

describe("runDemoReset", () => {
  it("could not run (2) without DEMO_MODE=1, and never connects", async () => {
    const connect = vi.fn();
    const code = await runDemoReset({ env: { DATABASE_URL: "postgres://demo" }, connect, today: new Date(), log: () => {}, error: () => {} });
    expect(code).toBe(2);
    expect(connect).not.toHaveBeenCalled();
  });

  it("could not run (2) without a database URL", async () => {
    expect((await run({ DEMO_MODE: "1" })).code).toBe(2);
  });

  it("refuses (1) when ALLOWED_EMAILS is set", async () => {
    const { code, errors, db } = await run({ ...demoEnv, ALLOWED_EMAILS: "alice@example.com" });
    expect(code).toBe(1);
    expect(errors.join()).toMatch(/ALLOWED_EMAILS/);
    expect(db.raw.$transaction).not.toHaveBeenCalled();
  });

  it("refuses (1) a database holding a real household, and truncates nothing", async () => {
    const db = fakeDb({ households: [DEMO_HOUSEHOLD_ID, "cm0realhousehold"] });
    const { code, errors } = await run(demoEnv, db);
    expect(code).toBe(1);
    expect(errors.join()).toMatch(/household other than the demo/);
    expect(db.calls.filter((call) => /TRUNCATE|createMany/.test(call))).toEqual([]);
  });

  it("refuses (1) a database holding a real user", async () => {
    const db = fakeDb({ households: [DEMO_HOUSEHOLD_ID], users: [DEMO_USER.id, "cm0realuser"] });
    expect((await run(demoEnv, db)).code).toBe(1);
    expect(db.calls.filter((call) => /TRUNCATE|createMany/.test(call))).toEqual([]);
  });

  it("resets (0): truncates every listed table, then seeds, then disconnects", async () => {
    const db = fakeDb({ households: [DEMO_HOUSEHOLD_ID], users: [DEMO_USER.id], tables: ["households", "we\"ird"] });
    const { code } = await run(demoEnv, db);
    expect(code).toBe(0);
    // Regression: the lock comes before the guard's reads, the TRUNCATE after them,
    // so no row can slip in between the check and the wipe, and no lock is upgraded.
    // One ACCESS EXCLUSIVE lock on every app table, in the order listed.
    expect(db.calls.slice(0, 5)).toEqual([
      // Bounded wait: a stuck lock aborts the night's reset instead of hanging it.
      "SET LOCAL lock_timeout = '10s'",
      'LOCK TABLE "households", "we""ird" IN ACCESS EXCLUSIVE MODE',
      "check household",
      "check user",
      'TRUNCATE "households", "we""ird"',
    ]);
    // A fixed order (two concurrent resets lock alike and cannot deadlock).
    const [strings] = db.tx.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray];
    expect(strings.join("?")).toMatch(/ORDER BY tablename\s*$/);
    expect(db.calls).toContain("createMany envelopeTransaction");
    expect(db.calls.indexOf("createMany household")).toBeLessThan(db.calls.indexOf("createMany envelope"));
    expect(db.raw.$disconnect).toHaveBeenCalled();
  });

  it("could not run (2) on a database error, and still disconnects", async () => {
    const db = fakeDb({ fail: new Error("connection reset") });
    const { code, errors } = await run(demoEnv, db);
    expect(code).toBe(2);
    expect(errors.join()).toMatch(/connection reset/);
    expect(db.raw.$disconnect).toHaveBeenCalled();
  });

  it("could not run (2) on a database without the app tables", async () => {
    const { code, errors } = await run(demoEnv, fakeDb({ tables: [] }));
    expect(code).toBe(2);
    expect(errors.join()).toMatch(/run the migrations first/);
  });
});
