import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ update: vi.fn(), revalidate: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { household: { update: fake.update } } }));
vi.mock("@/lib/auth/server", () => ({ getHousehold: async () => ({ householdId: "h1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: fake.revalidate }));

const { updateIncome } = await import("./budgets");

function form(income: string) {
  const f = new FormData();
  f.set("income", income);
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe("updateIncome", () => {
  it("writes the income on the caller's household only and revalidates", async () => {
    expect(await updateIncome(form("2500.75"))).toEqual({});
    expect(fake.update).toHaveBeenCalledWith({ where: { id: "h1" }, data: { income: 2500.75 } });
    expect(fake.revalidate.mock.calls.map((c) => c[0])).toEqual(["/configuration", "/enveloppes"]);
  });

  it("accepts zero", async () => {
    expect(await updateIncome(form("0"))).toEqual({});
  });

  it("ignores a householdId smuggled in the form", async () => {
    const f = form("10");
    f.set("id", "other");
    f.set("householdId", "other");
    await updateIncome(f);
    expect(fake.update.mock.calls[0][0].where).toEqual({ id: "h1" });
  });

  it.each([
    ["negative", "-1"],
    ["too large", "10000000000"],
    ["not a number", "abc"],
  ])("rejects an income that is %s", async (_l, v) => {
    expect((await updateIncome(form(v))).error).toBeTruthy();
    expect(fake.update).not.toHaveBeenCalled();
    expect(fake.revalidate).not.toHaveBeenCalled();
  });
});
