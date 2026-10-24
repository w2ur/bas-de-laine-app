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

// goals.ts pulls in Prisma's DATABASE_URL guard (through @/lib/prisma),
// next/headers (through @/lib/auth/server) and next/cache; none resolves
// under Vitest, so all three are mocked away.
vi.mock("@/lib/prisma", () => ({ prisma: fake.client }));
vi.mock("@/lib/auth/server", () => ({ getHousehold: async () => ({ householdId: "h" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { closeGoalEnvelope } = await import("./goals");

describe("closeGoalEnvelope", () => {
  beforeEach(() => {
    fake.state.row = { id: "g", type: "GOAL", isArchived: false };
    fake.state.transactions = [];
    fake.state.calls = [];
    fake.state.updates = [];
  });

  // Regression: b1cc5ca — closeGoalEnvelope read the balance, checked it
  // was zero and archived with no lock, so a deposit racing the close could
  // commit between the check and the UPDATE and be left in a closed goal
  // that no page lists. The row lock is now the first statement of one
  // transaction that also archives.
  it("takes the row lock before reading the balance, and closes in the same transaction", async () => {
    expect(await closeGoalEnvelope("g")).toEqual({});
    expect(fake.state.calls).toEqual(["begin", "lock", "findMany", "update", "commit"]);
    expect(fake.state.updates).toEqual([{ where: { id: "g", householdId: "h" }, data: { isArchived: true } }]);
  });

  it("refuses to close a goal that still holds money", async () => {
    fake.state.transactions = [{ amount: 200, type: "FILL" }];
    expect(await closeGoalEnvelope("g")).toEqual({ error: "Transférez le solde avant de clôturer." });
    expect(fake.state.updates).toEqual([]);
  });
});
