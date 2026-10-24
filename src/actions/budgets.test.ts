import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { id: string; type: "BUDGET" | "GOAL"; isArchived: boolean };
type Tx = { amount: number; type: "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT" };

const fake = vi.hoisted(() => {
  const state = {
    row: null as Row | null,
    transactions: [] as Tx[],
    calls: [] as string[],
    updates: [] as unknown[],
  };
  const client = {
    envelope: {
      findFirst: async () => {
        state.calls.push("findFirst");
        return state.row && { ...state.row, transactions: state.transactions };
      },
      update: async (args: unknown) => {
        state.calls.push("update");
        state.updates.push(args);
        return {};
      },
    },
    envelopeTransaction: {
      findMany: async () => {
        state.calls.push("findMany");
        return state.transactions;
      },
    },
    $queryRaw: async () => {
      state.calls.push("lock");
      return state.row ? [state.row] : [];
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

// budgets.ts pulls in Prisma's DATABASE_URL guard (through @/lib/prisma),
// next/headers (through @/lib/auth/server) and next/cache; none resolves
// under Vitest, so all three are mocked away.
vi.mock("@/lib/prisma", () => ({ prisma: fake.client }));
vi.mock("@/lib/auth/server", () => ({ getHousehold: async () => ({ householdId: "h" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { archiveEnvelope } = await import("./budgets");

function goalWith(transactions: Tx[]) {
  fake.state.row = { id: "g", type: "GOAL", isArchived: false };
  fake.state.transactions = transactions;
}

describe("archiveEnvelope", () => {
  beforeEach(() => {
    fake.state.row = null;
    fake.state.transactions = [];
    fake.state.calls = [];
    fake.state.updates = [];
  });

  // Regression: 75746c0 — the GOAL zero-balance check compared with a raw
  // `Math.abs(balance) > 0.001` instead of isZeroAmount, so archiving and
  // closeGoalEnvelope disagreed on what a zero balance is: a balance under
  // half a cent (0,00 € once rounded) blocked the archive while the same
  // goal could be closed. It now uses the half-cent tolerance of money.ts.
  it("archives a GOAL whose balance rounds to 0,00 €", async () => {
    goalWith([{ amount: 0.004, type: "FILL" }]);
    const result = await archiveEnvelope("g");
    expect(result).toEqual({});
    expect(fake.state.updates).toEqual([{ where: { id: "g", householdId: "h" }, data: { isArchived: true } }]);
  });

  it("refuses to archive a GOAL that still holds a cent", async () => {
    goalWith([{ amount: 0.01, type: "FILL" }]);
    const result = await archiveEnvelope("g");
    expect(result).toEqual({ error: "Transférez le solde avant d'archiver." });
    expect(fake.state.updates).toEqual([]);
  });

  it("archives a GOAL whose fills and spends cancel out to float dust", async () => {
    goalWith([
      { amount: 1.1, type: "FILL" },
      { amount: 2.2, type: "FILL" },
      { amount: 3.3, type: "SPEND" },
    ]);
    expect(await archiveEnvelope("g")).toEqual({});
  });

  // Regression: b1cc5ca — archiveEnvelope read the balance and archived
  // with no lock, so a deposit racing the archive could commit between the
  // zero check and the UPDATE and be left in an archived goal. The row lock
  // is now the first statement of one transaction that also archives.
  it("takes the row lock before reading the balance, and archives in the same transaction", async () => {
    goalWith([]);
    expect(await archiveEnvelope("g")).toEqual({});
    expect(fake.state.calls).toEqual(["begin", "lock", "findMany", "update", "commit"]);
  });
});
