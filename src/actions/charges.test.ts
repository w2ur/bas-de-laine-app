import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { recurringCharge: { create: fake.create, update: fake.update, delete: fake.del } },
}));
vi.mock("@/lib/auth/server", () => ({ getHousehold: async () => ({ householdId: "h1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: fake.revalidate }));

const { createCharge, updateCharge, deleteCharge, toggleCharge } = await import("./charges");

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
const valid = { name: "Loyer", amount: "850.5", dayOfMonth: "5", active: "true" };
const p2025 = Object.assign(new Error("not found"), { code: "P2025" });
const REVALIDATED = ["/configuration", "/configuration/charges-fixes", "/enveloppes"];

beforeEach(() => vi.clearAllMocks());

function expectRevalidated() {
  expect(fake.revalidate.mock.calls.map((c) => c[0])).toEqual(REVALIDATED);
}

describe("createCharge", () => {
  it("stores the charge under the caller's household with a cent-rounded amount", async () => {
    const result = await createCharge(form({ ...valid, amount: "850.504" }));
    expect(result).toEqual({});
    expect(fake.create).toHaveBeenCalledWith({
      data: { householdId: "h1", name: "Loyer", amount: 850.5, dayOfMonth: 5, active: true },
    });
    expectRevalidated();
  });

  it("ignores a householdId smuggled in the form", async () => {
    await createCharge(form({ ...valid, householdId: "other" }));
    expect(fake.create.mock.calls[0][0].data.householdId).toBe("h1");
  });

  it.each([
    ["negative", "-5"],
    ["zero", "0"],
    ["rounds to zero", "0.004"],
    ["too large", "10000000000"],
    ["not a number", "abc"],
  ])("rejects an amount that is %s", async (_label, amount) => {
    const result = await createCharge(form({ ...valid, amount }));
    expect(result.error).toBeTruthy();
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.revalidate).not.toHaveBeenCalled();
  });

  it.each(["0", "32", "1.5"])("rejects dayOfMonth %s", async (dayOfMonth) => {
    const result = await createCharge(form({ ...valid, dayOfMonth }));
    expect(result.error).toBeTruthy();
    expect(fake.create).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    expect((await createCharge(form({ ...valid, name: "" }))).error).toBe("Le nom est requis");
  });

  it("treats a missing active field as inactive", async () => {
    await createCharge(form({ name: "X", amount: "1", dayOfMonth: "1" }));
    expect(fake.create.mock.calls[0][0].data.active).toBe(false);
  });
});

describe("updateCharge", () => {
  it("scopes the update to the household", async () => {
    expect(await updateCharge("c1", form(valid))).toEqual({});
    expect(fake.update).toHaveBeenCalledWith({
      where: { id: "c1", householdId: "h1" },
      data: { name: "Loyer", amount: 850.5, dayOfMonth: 5, active: true },
    });
    expectRevalidated();
  });

  it("refuses another household's charge (P2025) without revalidating", async () => {
    fake.update.mockRejectedValueOnce(p2025);
    expect(await updateCharge("foreign", form(valid))).toEqual({ error: "Charge introuvable" });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });

  it("rethrows an unexpected database error", async () => {
    fake.update.mockRejectedValueOnce(new Error("boom"));
    await expect(updateCharge("c1", form(valid))).rejects.toThrow("boom");
  });

  it("validates before touching the database", async () => {
    expect((await updateCharge("c1", form({ ...valid, amount: "-1" }))).error).toBeTruthy();
    expect(fake.update).not.toHaveBeenCalled();
  });
});

describe("deleteCharge", () => {
  it("scopes the delete to the household and revalidates", async () => {
    expect(await deleteCharge("c1")).toEqual({});
    expect(fake.del).toHaveBeenCalledWith({ where: { id: "c1", householdId: "h1" } });
    expectRevalidated();
  });

  it("refuses another household's charge", async () => {
    fake.del.mockRejectedValueOnce(p2025);
    expect(await deleteCharge("foreign")).toEqual({ error: "Charge introuvable" });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });

  it("rethrows an unexpected database error", async () => {
    fake.del.mockRejectedValueOnce(new Error("boom"));
    await expect(deleteCharge("c1")).rejects.toThrow("boom");
  });
});

describe("toggleCharge", () => {
  it.each([true, false])("sets active=%s scoped to the household", async (active) => {
    expect(await toggleCharge("c1", active)).toEqual({});
    expect(fake.update).toHaveBeenCalledWith({
      where: { id: "c1", householdId: "h1" },
      data: { active },
    });
    expectRevalidated();
  });

  it("refuses another household's charge", async () => {
    fake.update.mockRejectedValueOnce(p2025);
    expect(await toggleCharge("foreign", true)).toEqual({ error: "Charge introuvable" });
    expect(fake.revalidate).not.toHaveBeenCalled();
  });

  it("rethrows an unexpected database error", async () => {
    fake.update.mockRejectedValueOnce(new Error("boom"));
    await expect(toggleCharge("c1", true)).rejects.toThrow("boom");
  });
});
