import { describe, it, expect, vi, beforeEach } from "vitest";

// A two-household in-memory database: each fake delegate honours the `where`
// it is given, so a query that forgets its household filter returns the other
// household's rows and fails the scoping assertions below.
const db = vi.hoisted(() => {
  const D = (n: number | string) => ({ toString: () => String(n), valueOf: () => Number(n) });
  const month = (d: number) => new Date(2026, 5, d, 12); // June 2026 (financial month 1 Jun - 28 Jun)
  const data = {
    households: [
      { id: "h1", income: D("3000.50") },
      { id: "h2", income: D("9999") },
    ],
    charges: [
      { id: "c1", householdId: "h1", amount: D("800.25"), dayOfMonth: 20, active: true },
      { id: "c2", householdId: "h1", amount: D("100"), dayOfMonth: 3, active: true },
      { id: "c3", householdId: "h1", amount: D("55"), dayOfMonth: 10, active: false },
      { id: "c4", householdId: "h2", amount: D("5000"), dayOfMonth: 1, active: true },
    ],
    envelopes: [
      { id: "e1", householdId: "h1", name: "Courses", icon: "x", color: "c", type: "BUDGET", isArchived: false,
        sortOrder: 1, monthlyBudget: D("400"), fillCadence: "WEEKLY", targetAmount: null, targetDate: null, transactions: [] as unknown[] },
      { id: "e2", householdId: "h1", name: "Vieux", icon: "x", color: "c", type: "BUDGET", isArchived: true,
        sortOrder: 0, monthlyBudget: D("10"), fillCadence: "WEEKLY", targetAmount: null, targetDate: null, transactions: [] as unknown[] },
      { id: "e3", householdId: "h2", name: "Autre", icon: "x", color: "c", type: "BUDGET", isArchived: false,
        sortOrder: 0, monthlyBudget: D("1"), fillCadence: "WEEKLY", targetAmount: null, targetDate: null, transactions: [] as unknown[] },
    ],
    txs: [
      { id: "t1", envelopeId: "e1", householdId: "h1", date: month(10), createdAt: month(10), amount: D("120.5"), type: "FILL", description: "f", linkedTransactionId: null },
      { id: "t2", envelopeId: "e1", householdId: "h1", date: month(12), createdAt: month(12), amount: D("20.25"), type: "SPEND", description: "s", linkedTransactionId: null },
      { id: "t3", envelopeId: "e3", householdId: "h2", date: month(11), createdAt: month(11), amount: D("77"), type: "FILL", description: "x", linkedTransactionId: null },
      { id: "t4", envelopeId: "e1", householdId: "h1", date: new Date(2026, 3, 2), createdAt: new Date(2026, 3, 2), amount: D("5"), type: "FILL", description: "old", linkedTransactionId: null },
    ],
    treasuries: [
      { id: "tr1", householdId: "h1", balance: D("1500.75"),
        adjustments: [{ id: "a1", amount: D("10.5"), type: "SET", label: "l", createdAt: month(1) }],
        pools: [
          { id: "p2", name: "B", availability: "LONG", amount: D("500.25"), order: 1 },
          { id: "p1", name: "A", availability: "IMMEDIATE", amount: D("1000.5"), order: 0 },
        ] },
      { id: "tr2", householdId: "h2", balance: D("1"), adjustments: [], pools: [] },
    ],
  };
  type Where = { householdId?: string; active?: boolean; isArchived?: boolean };
  const match = (row: Record<string, unknown>, w: Where = {}) =>
    Object.entries(w).every(([k, v]) => row[k] === v);
  const prisma = {
    household: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const h = data.households.find((x) => x.id === where.id);
        if (!h) throw new Error("not found");
        return h;
      },
    },
    recurringCharge: {
      findMany: async ({ where, orderBy }: { where: Where; orderBy?: { dayOfMonth: "asc" } }) => {
        const rows = data.charges.filter((c) => match(c, where));
        return orderBy ? [...rows].sort((a, b) => a.dayOfMonth - b.dayOfMonth) : rows;
      },
    },
    envelope: {
      findMany: async ({ where, include }: { where: Where; include?: unknown }) =>
        data.envelopes
          .filter((e) => match(e, where))
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((e) => ({ ...e, transactions: include ? data.txs.filter((t) => t.envelopeId === e.id) : [] })),
    },
    envelopeTransaction: {
      findMany: async ({ where }: { where: { date: { gte: Date; lte: Date }; envelope: { householdId: string } } }) =>
        data.txs
          .filter((t) => t.householdId === where.envelope.householdId && t.date >= where.date.gte && t.date <= where.date.lte)
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .map((t) => ({ ...t, envelope: data.envelopes.find((e) => e.id === t.envelopeId), linkedTransaction: null })),
    },
    treasury: {
      findUnique: async ({ where }: { where: { householdId: string } }) =>
        data.treasuries.find((t) => t.householdId === where.householdId) ?? null,
    },
  };
  return { prisma, data };
});

vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));
// React's cache() is request-scoped and absent under Vitest: make it a pass-through.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const { getRecurringCharges } = await import("./charges");
const { getDashboardData } = await import("./dashboard");
const { getTreasury } = await import("./treasury");
const { getFillPlan, getRecentTransactions, getAllEnvelopes } = await import("./envelopes");

const JUNE = new Date(2026, 5, 15);

beforeEach(() => vi.useRealTimers());

describe("getRecurringCharges", () => {
  it("returns only the household's charges, active or not, ordered by day of month", async () => {
    const rows = await getRecurringCharges("h1");
    expect(rows.map((r) => r.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("returns nothing for a household with no charge row of its own", async () => {
    expect(await getRecurringCharges("nobody")).toEqual([]);
  });
});

describe("getDashboardData", () => {
  it("computes income, active charges and pool in euros from the caller's household", async () => {
    const d = await getDashboardData("h1", JUNE);
    expect(d.totalIncome).toBe(3000.5);
    // c3 is inactive and c4 belongs to h2: only 800.25 + 100.
    expect(d.totalCharges).toBeCloseTo(900.25, 2);
    expect(d.pool).toBeCloseTo(2100.25, 2);
  });

  it("lists only that household's non-archived budget envelopes with month-scoped figures", async () => {
    const d = await getDashboardData("h1", JUNE);
    expect(d.envelopeBalances.map((e) => e.id)).toEqual(["e1"]);
    const e = d.envelopeBalances[0];
    expect(e.filled).toBeCloseTo(120.5, 2);
    expect(e.spent).toBeCloseTo(20.25, 2);
    // balance is cumulative: includes the April fill of 5.
    expect(e.balance).toBeCloseTo(105.25, 2);
    expect(d.totalFills).toBeCloseTo(120.5, 2);
  });

  it("never mixes in the other household's figures", async () => {
    const d = await getDashboardData("h2", JUNE);
    expect(d.totalIncome).toBe(9999);
    expect(d.totalCharges).toBe(5000);
    expect(d.envelopeBalances.map((e) => e.id)).toEqual(["e3"]);
    expect(d.totalFills).toBeCloseTo(77, 2);
  });

  it("rejects an unknown household", async () => {
    await expect(getDashboardData("nobody", JUNE)).rejects.toThrow();
  });
});

describe("getTreasury", () => {
  it("returns the caller's treasury with numeric amounts, pools ordered and totalled", async () => {
    const t = await getTreasury("h1");
    expect(t).not.toBeNull();
    expect(t!.id).toBe("tr1");
    expect(t!.balance).toBe(1500.75);
    expect(t!.adjustments).toEqual([{ id: "a1", amount: 10.5, type: "SET", label: "l", createdAt: expect.any(Date) }]);
    expect(t!.pools.map((p) => p.name).sort()).toEqual(["A", "B"]);
    expect(t!.poolsTotal).toBeCloseTo(1500.75, 2);
    expect(typeof t!.pools[0].amount).toBe("number");
  });

  it("returns null, never another household's treasury, when there is none", async () => {
    expect(await getTreasury("nobody")).toBeNull();
  });
});

describe("getAllEnvelopes", () => {
  it("returns the household's envelopes, archived included, and nobody else's", async () => {
    const rows = await getAllEnvelopes("h1");
    expect(rows.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(await getAllEnvelopes("nobody")).toEqual([]);
  });
});

describe("getRecentTransactions", () => {
  it("returns the month's transactions of the household only, as numbers, newest first", async () => {
    const rows = await getRecentTransactions("h1", JUNE);
    expect(rows.map((r) => r.id)).toEqual(["t2", "t1"]);
    expect(rows.map((r) => r.amount)).toEqual([20.25, 120.5]);
    expect(rows[0].counterpart).toBeNull();
    expect(rows[0].envelope).toMatchObject({ id: "e1", name: "Courses" });
  });

  it("excludes transactions outside the financial month", async () => {
    const rows = await getRecentTransactions("h1", JUNE);
    expect(rows.find((r) => r.id === "t4")).toBeUndefined();
  });

  it("does not leak the other household's transactions", async () => {
    const rows = await getRecentTransactions("h1", JUNE);
    expect(rows.find((r) => r.id === "t3")).toBeUndefined();
    expect((await getRecentTransactions("nobody", JUNE))).toEqual([]);
  });
});

describe("getFillPlan", () => {
  it("plans only the household's budget envelopes and exposes a yyyy-MM-dd Monday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T10:00:00Z"));
    const plan = await getFillPlan("h1", JUNE);
    expect(plan.mondayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(plan.mondayDate + "T12:00:00").getDay()).toBe(1);
    const ids = plan.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain("e1");
    expect(ids).not.toContain("e3");
    expect(ids).not.toContain("e2");
  });

  it("returns no rows for a household without envelopes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T10:00:00Z"));
    expect((await getFillPlan("nobody", JUNE)).rows).toEqual([]);
  });
});
