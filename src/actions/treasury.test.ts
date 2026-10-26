import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({
  findUnique: vi.fn(),
  poolFind: vi.fn(),
  aggregate: vi.fn(),
  poolCreate: vi.fn(),
  poolUpdate: vi.fn(),
  poolDelete: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    treasury: { findUnique: fake.findUnique },
    treasuryPool: {
      findUnique: fake.poolFind,
      aggregate: fake.aggregate,
      create: fake.poolCreate,
      update: fake.poolUpdate,
      delete: fake.poolDelete,
    },
  },
}));
vi.mock("@/lib/auth/server", () => ({ getHousehold: async () => ({ householdId: "h1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: fake.revalidate }));

const { createTreasuryPool, updateTreasuryPool, deleteTreasuryPool } = await import("./treasury");

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
const valid = { name: "Livret A", availability: "IMMEDIATE", amount: "1200.5" };

beforeEach(() => {
  vi.clearAllMocks();
  fake.findUnique.mockResolvedValue({ id: "t1" });
  fake.aggregate.mockResolvedValue({ _max: { order: 2 } });
});

describe("createTreasuryPool", () => {
  it("creates the pool on the household's treasury, ordered after the last one", async () => {
    expect(await createTreasuryPool(form(valid))).toEqual({});
    expect(fake.findUnique).toHaveBeenCalledWith({ where: { householdId: "h1" } });
    expect(fake.poolCreate).toHaveBeenCalledWith({
      data: { treasuryId: "t1", name: "Livret A", availability: "IMMEDIATE", amount: 1200.5, order: 3 },
    });
    expect(fake.revalidate).toHaveBeenCalledWith("/tresorerie", "layout");
  });

  it("starts at order 0 when there is no pool yet", async () => {
    fake.aggregate.mockResolvedValue({ _max: { order: null } });
    await createTreasuryPool(form(valid));
    expect(fake.poolCreate.mock.calls[0][0].data.order).toBe(0);
  });

  it("accepts a zero amount", async () => {
    expect(await createTreasuryPool(form({ ...valid, amount: "0" }))).toEqual({});
  });

  it.each([
    ["negative", { amount: "-1" }],
    ["too large", { amount: "10000000000" }],
    ["not a number", { amount: "abc" }],
    ["bad availability", { availability: "NEVER" }],
    ["empty name", { name: "" }],
  ])("rejects %s", async (_l, patch) => {
    const result = await createTreasuryPool(form({ ...valid, ...patch }));
    expect(result.error).toBeTruthy();
    expect(fake.poolCreate).not.toHaveBeenCalled();
    expect(fake.revalidate).not.toHaveBeenCalled();
  });

  it("reports a missing treasury", async () => {
    fake.findUnique.mockResolvedValue(null);
    expect(await createTreasuryPool(form(valid))).toEqual({ error: "Trésorerie introuvable" });
    expect(fake.poolCreate).not.toHaveBeenCalled();
  });
});

describe("updateTreasuryPool", () => {
  it("updates a pool owned by the household", async () => {
    fake.poolFind.mockResolvedValue({ id: "p1", treasury: { householdId: "h1" } });
    expect(await updateTreasuryPool(form({ ...valid, id: "p1" }))).toEqual({});
    expect(fake.poolUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { name: "Livret A", availability: "IMMEDIATE", amount: 1200.5 },
    });
    expect(fake.revalidate).toHaveBeenCalledWith("/tresorerie", "layout");
  });

  it("refuses another household's pool", async () => {
    fake.poolFind.mockResolvedValue({ id: "p9", treasury: { householdId: "other" } });
    expect(await updateTreasuryPool(form({ ...valid, id: "p9" }))).toEqual({ error: "Compte introuvable" });
    expect(fake.poolUpdate).not.toHaveBeenCalled();
    expect(fake.revalidate).not.toHaveBeenCalled();
  });

  it("refuses an unknown pool", async () => {
    fake.poolFind.mockResolvedValue(null);
    expect((await updateTreasuryPool(form({ ...valid, id: "nope" }))).error).toBe("Compte introuvable");
  });

  it("rejects a negative amount before any lookup", async () => {
    expect((await updateTreasuryPool(form({ ...valid, id: "p1", amount: "-3" }))).error).toBeTruthy();
    expect(fake.poolFind).not.toHaveBeenCalled();
  });
});

describe("deleteTreasuryPool", () => {
  it("deletes a pool owned by the household", async () => {
    fake.poolFind.mockResolvedValue({ id: "p1", treasury: { householdId: "h1" } });
    expect(await deleteTreasuryPool("p1")).toEqual({});
    expect(fake.poolDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(fake.revalidate).toHaveBeenCalledWith("/tresorerie", "layout");
  });

  it("refuses another household's pool", async () => {
    fake.poolFind.mockResolvedValue({ id: "p9", treasury: { householdId: "other" } });
    expect(await deleteTreasuryPool("p9")).toEqual({ error: "Compte introuvable" });
    expect(fake.poolDelete).not.toHaveBeenCalled();
  });

  it("refuses an unknown pool", async () => {
    fake.poolFind.mockResolvedValue(null);
    expect(await deleteTreasuryPool("nope")).toEqual({ error: "Compte introuvable" });
    expect(fake.poolDelete).not.toHaveBeenCalled();
  });
});
