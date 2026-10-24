import { describe, it, expect, vi, beforeEach } from "vitest";

type Envelope = {
  id: string;
  householdId: string;
  type: "BUDGET" | "GOAL";
  isArchived: boolean;
  targetAmount: number | null;
};
type Transaction = { id: string; envelopeId: string; linkedTransactionId: string | null };

const fake = vi.hoisted(() => {
  const state = {
    envelopes: {} as Record<string, Envelope>,
    /** What the lock statement sees, when it differs from the earlier read (a race). */
    archivedUnderLock: {} as Record<string, boolean>,
    transactions: {} as Record<string, Transaction>,
    calls: [] as string[],
    lockValues: [] as unknown[][],
    creates: [] as unknown[],
  };
  const lockedRows = (values: unknown[]) => {
    const ids: string[] = [];
    let householdId: string | null = null;
    for (const v of values) {
      if (typeof v === "object" && v !== null && "values" in v) ids.push(...(v as { values: string[] }).values);
      else if (typeof v === "string" && state.envelopes[v]) ids.push(v);
      else if (typeof v === "string") householdId = v;
    }
    return [...ids]
      .sort()
      .map((id) => state.envelopes[id])
      .filter((e): e is Envelope => e !== undefined && (householdId === null || e.householdId === householdId))
      .map((e) => ({
        id: e.id,
        type: e.type,
        targetAmount: e.targetAmount,
        isArchived: state.archivedUnderLock[e.id] ?? e.isArchived,
      }));
  };
  const client = {
    envelope: {
      findFirst: async ({ where }: { where: { id: string; householdId: string } }) => {
        state.calls.push("findFirst");
        const e = state.envelopes[where.id];
        return e && e.householdId === where.householdId ? e : null;
      },
    },
    envelopeTransaction: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        state.calls.push("findUnique");
        const t = state.transactions[where.id];
        return t ? { ...t, envelope: state.envelopes[t.envelopeId] } : null;
      },
      findMany: async () => {
        state.calls.push("findMany");
        return [];
      },
      create: async (args: unknown) => {
        state.calls.push("create");
        state.creates.push(args);
        return {};
      },
      update: async ({ where, data }: { where: { id: string }; data: { linkedTransactionId: null } }) => {
        state.calls.push(`update:${where.id}`);
        state.transactions[where.id] = { ...state.transactions[where.id], ...data };
        return {};
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.calls.push(`delete:${where.id}`);
        if (!state.transactions[where.id]) throw Object.assign(new Error("not found"), { code: "P2025" });
        delete state.transactions[where.id];
        return {};
      },
    },
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      state.calls.push("lock");
      state.lockValues.push(values);
      return lockedRows(values);
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      state.calls.push("begin");
      const result = await fn(client);
      state.calls.push("commit");
      return result;
    },
  };
  return { state, client };
});

// envelopes.ts pulls in Prisma's DATABASE_URL guard (through @/lib/prisma),
// next/headers (through @/lib/auth/server) and next/cache; none resolves
// under Vitest, so all three are mocked away.
vi.mock("@/lib/prisma", () => ({ prisma: fake.client }));
vi.mock("@/lib/auth/server", () => ({ getHousehold: async () => ({ householdId: "h" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { fillEnvelope, spendFromEnvelope, deleteEnvelopeTransaction } = await import("./envelopes");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function envelope(id: string, type: "BUDGET" | "GOAL", isArchived: boolean, targetAmount: number | null = null) {
  fake.state.envelopes[id] = { id, householdId: "h", type, isArchived, targetAmount };
}

function transferPair(outId: string, fromEnvelope: string, inId: string, toEnvelope: string) {
  fake.state.transactions[outId] = { id: outId, envelopeId: fromEnvelope, linkedTransactionId: inId };
  fake.state.transactions[inId] = { id: inId, envelopeId: toEnvelope, linkedTransactionId: outId };
}

beforeEach(() => {
  fake.state.envelopes = {};
  fake.state.archivedUnderLock = {};
  fake.state.transactions = {};
  fake.state.calls = [];
  fake.state.lockValues = [];
  fake.state.creates = [];
});

describe("BUDGET fill and spend on an archived envelope", () => {
  beforeEach(() => envelope("b", "BUDGET", true));

  // Regression: b1cc5ca — fillEnvelope never read isArchived, so a deposit
  // from a stale tab into an envelope archived on another device was
  // written, and the money vanished from every view (getEnvelopes filters
  // archived envelopes and none can be unarchived).
  it("refuses a deposit into an archived BUDGET envelope", async () => {
    const result = await fillEnvelope(form({ envelopeId: "b", amount: "200" }));
    expect(result).toEqual({ error: "Cette enveloppe a été archivée. Rechargez la page." });
    expect(fake.state.creates).toEqual([]);
  });

  // Regression: b1cc5ca — same stale-tab path for a spend: it was recorded
  // on an envelope no view shows, so no total ever reflected it.
  it("refuses a spend from an archived BUDGET envelope", async () => {
    const result = await spendFromEnvelope(form({ envelopeId: "b", amount: "20" }));
    expect(result).toEqual({ error: "Cette enveloppe a été archivée. Rechargez la page." });
    expect(fake.state.creates).toEqual([]);
  });

  it("still fills and spends an active BUDGET envelope", async () => {
    envelope("b", "BUDGET", false);
    expect(await fillEnvelope(form({ envelopeId: "b", amount: "200" }))).toEqual({});
    expect(await spendFromEnvelope(form({ envelopeId: "b", amount: "20" }))).toEqual({});
    expect(fake.state.creates).toHaveLength(2);
  });
});

describe("fillEnvelope on a GOAL with no target", () => {
  // Regression: 18f593b — only a GOAL with a target took the locked
  // runGoalFillWrite path; a GOAL with a null target (restorable from a
  // backup) took the unlocked insert, which does not conflict with
  // runArchiveWrite's lock, so a deposit could commit between the close's
  // zero-balance check and its UPDATE. Every GOAL deposit now takes the
  // lock; with no target there is simply no ceiling.
  it("deposits through the row lock, with no ceiling", async () => {
    envelope("g", "GOAL", false, null);
    expect(await fillEnvelope(form({ envelopeId: "g", amount: "5000" }))).toEqual({});
    expect(fake.state.calls).toEqual(["findFirst", "begin", "lock", "create", "commit"]);
  });

  it("refuses the deposit when the lock sees the goal closed by a racing close", async () => {
    envelope("g", "GOAL", false, null);
    fake.state.archivedUnderLock.g = true;
    const result = await fillEnvelope(form({ envelopeId: "g", amount: "50" }));
    expect(result).toEqual({ error: "Cet objectif a été clôturé. Rechargez la page." });
    expect(fake.state.creates).toEqual([]);
  });
});

describe("deleteEnvelopeTransaction on archived envelopes", () => {
  const archivedError = "Cette opération touche une enveloppe archivée : elle ne peut plus être supprimée.";

  // Regression: 9370869 — deleteEnvelopeTransaction never read isArchived
  // on either leg, and the history page lists archived envelopes' rows.
  // Transferring 200 € from a goal to a budget, closing the goal, then
  // deleting the transfer from the budget's side put the 200 € back into
  // the closed goal, where no page shows it and no transfer can reach it.
  // A delete touching an archived envelope on either leg is now refused.
  it("refuses to delete a transfer whose other leg sits in a closed goal", async () => {
    envelope("goal", "GOAL", true, 1000);
    envelope("budget", "BUDGET", false);
    transferPair("out", "goal", "in", "budget");
    expect(await deleteEnvelopeTransaction("in")).toEqual({ error: archivedError });
    expect(Object.keys(fake.state.transactions).sort()).toEqual(["in", "out"]);
    expect(fake.state.calls.some((c) => c.startsWith("delete:") || c.startsWith("update:"))).toBe(false);
  });

  it("refuses to delete a single transaction of a closed goal", async () => {
    envelope("goal", "GOAL", true, 1000);
    fake.state.transactions.fill = { id: "fill", envelopeId: "goal", linkedTransactionId: null };
    expect(await deleteEnvelopeTransaction("fill")).toEqual({ error: archivedError });
    expect(fake.state.transactions.fill).toBeDefined();
  });

  it("refuses to delete a single transaction of an archived BUDGET envelope", async () => {
    envelope("budget", "BUDGET", true);
    fake.state.transactions.spend = { id: "spend", envelopeId: "budget", linkedTransactionId: null };
    expect(await deleteEnvelopeTransaction("spend")).toEqual({ error: archivedError });
    expect(fake.state.transactions.spend).toBeDefined();
  });

  it("refuses the delete when the lock sees a goal closed by a racing close", async () => {
    envelope("goal", "GOAL", false, 1000);
    envelope("budget", "BUDGET", false);
    transferPair("out", "goal", "in", "budget");
    fake.state.archivedUnderLock.goal = true;
    expect(await deleteEnvelopeTransaction("in")).toEqual({ error: archivedError });
    expect(Object.keys(fake.state.transactions).sort()).toEqual(["in", "out"]);
  });

  it("locks both legs' envelopes in id order, with the household, before deleting the pair", async () => {
    envelope("zeta", "BUDGET", false);
    envelope("alpha", "GOAL", false, 1000);
    transferPair("out", "zeta", "in", "alpha");
    expect(await deleteEnvelopeTransaction("out")).toEqual({});
    expect(fake.state.transactions).toEqual({});
    const lockAt = fake.state.calls.indexOf("lock");
    const firstWriteAt = fake.state.calls.findIndex((c) => c.startsWith("update:") || c.startsWith("delete:"));
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(firstWriteAt).toBeGreaterThanOrEqual(0);
    expect(lockAt).toBeLessThan(firstWriteAt);
    const [joined, householdId] = fake.state.lockValues[0] as [{ values: string[] }, string];
    expect(joined.values).toEqual(["alpha", "zeta"]);
    expect(householdId).toBe("h");
  });

  it("still deletes a single transaction of an active envelope, under the lock", async () => {
    envelope("budget", "BUDGET", false);
    fake.state.transactions.spend = { id: "spend", envelopeId: "budget", linkedTransactionId: null };
    expect(await deleteEnvelopeTransaction("spend")).toEqual({});
    expect(fake.state.transactions).toEqual({});
    expect(fake.state.calls.indexOf("lock")).toBeGreaterThanOrEqual(0);
    expect(fake.state.calls.indexOf("delete:spend")).toBeGreaterThanOrEqual(0);
    expect(fake.state.calls.indexOf("lock")).toBeLessThan(fake.state.calls.indexOf("delete:spend"));
  });

  it("refuses to delete a transaction of another household, and deletes nothing", async () => {
    envelope("budget", "BUDGET", false);
    fake.state.envelopes.foreign = { id: "foreign", householdId: "other", type: "BUDGET", isArchived: false, targetAmount: null };
    fake.state.transactions.theirs = { id: "theirs", envelopeId: "foreign", linkedTransactionId: null };
    expect(await deleteEnvelopeTransaction("theirs")).toEqual({ error: "Transaction introuvable" });
    expect(fake.state.transactions.theirs).toBeDefined();
    expect(fake.state.calls.some((c) => c.startsWith("delete:") || c.startsWith("update:"))).toBe(false);
  });

  it("refuses to delete a transfer whose other leg sits in another household's envelope", async () => {
    envelope("budget", "BUDGET", false);
    fake.state.envelopes.foreign = { id: "foreign", householdId: "other", type: "BUDGET", isArchived: false, targetAmount: null };
    transferPair("mine", "budget", "theirs", "foreign");
    expect(await deleteEnvelopeTransaction("mine")).toEqual({ error: "Transaction introuvable" });
    expect(Object.keys(fake.state.transactions).sort()).toEqual(["mine", "theirs"]);
  });
});
