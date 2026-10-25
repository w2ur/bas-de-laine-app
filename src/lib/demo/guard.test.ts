import { describe, expect, it, vi } from "vitest";
import { DEMO_HOUSEHOLD_ID, DEMO_USER, demoEnvRefusal, isDemoMode } from "./mode";
import { assertDemoSafe, DemoRefusal, demoDataRefusal, isDemoRefusal, isPrismaRequestError, type DemoGuardDb } from "./guard";

/** A fake database holding the given household and user ids. */
function db(households: string[], users: string[]) {
  const pick = (ids: string[]) =>
    vi.fn(async ({ where }: { where: { id: { not: string } } }) => {
      const id = ids.find((candidate) => candidate !== where.id.not);
      return id ? { id } : null;
    });
  return { household: { findFirst: pick(households) }, user: { findFirst: pick(users) } } satisfies DemoGuardDb;
}

describe("isDemoMode", () => {
  it("is on for exactly DEMO_MODE=1", () => {
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(true);
  });

  it("is off when unset, empty, 0, or any other spelling", () => {
    for (const value of [undefined, "", "0", "true", "yes", " 1"]) {
      expect(isDemoMode({ DEMO_MODE: value })).toBe(false);
    }
  });
});

describe("demoEnvRefusal", () => {
  it("refuses when ALLOWED_EMAILS lists anyone", () => {
    expect(demoEnvRefusal({ ALLOWED_EMAILS: "alice@example.com" })).toMatch(/ALLOWED_EMAILS is set/);
  });

  it("refuses even a separator-only ALLOWED_EMAILS: it was configured on purpose", () => {
    expect(demoEnvRefusal({ ALLOWED_EMAILS: "," })).not.toBeNull();
  });

  it("allows an unset, empty or blank ALLOWED_EMAILS", () => {
    expect(demoEnvRefusal({})).toBeNull();
    expect(demoEnvRefusal({ ALLOWED_EMAILS: "" })).toBeNull();
    expect(demoEnvRefusal({ ALLOWED_EMAILS: "  " })).toBeNull();
  });
});

describe("demoDataRefusal", () => {
  it("refuses a database holding another household", async () => {
    expect(await demoDataRefusal(db([DEMO_HOUSEHOLD_ID, "cm0realhousehold"], []))).toMatch(/household other than the demo/);
  });

  it("refuses a database holding another user, even in the demo household", async () => {
    expect(await demoDataRefusal(db([DEMO_HOUSEHOLD_ID], [DEMO_USER.id, "cm0realuser"]))).toMatch(/user other than the demo/);
  });

  it("allows an empty database", async () => {
    expect(await demoDataRefusal(db([], []))).toBeNull();
  });

  it("allows a database holding only the demo household and user", async () => {
    expect(await demoDataRefusal(db([DEMO_HOUSEHOLD_ID], [DEMO_USER.id]))).toBeNull();
  });
});

describe("assertDemoSafe", () => {
  it("throws on the env refusal without querying the database", async () => {
    const fake = db([], []);
    await expect(assertDemoSafe(fake, { ALLOWED_EMAILS: "alice@example.com" })).rejects.toThrow(/ALLOWED_EMAILS/);
    expect(fake.household.findFirst).not.toHaveBeenCalled();
  });

  it("throws on the database refusal", async () => {
    await expect(assertDemoSafe(db(["cm0realhousehold"], []), {})).rejects.toThrow(/household other than the demo/);
  });

  it("throws refusals as DemoRefusal, and a database error as it is", async () => {
    await expect(assertDemoSafe(db([], []), { ALLOWED_EMAILS: "a@example.com" })).rejects.toBeInstanceOf(DemoRefusal);
    await expect(assertDemoSafe(db(["cm0realhousehold"], []), {})).rejects.toBeInstanceOf(DemoRefusal);
    const down = new Error("connect ECONNREFUSED");
    const broken = { household: { findFirst: vi.fn().mockRejectedValue(down) }, user: { findFirst: vi.fn() } };
    await expect(assertDemoSafe(broken, {})).rejects.toBe(down);
  });

  it("resolves when both halves pass", async () => {
    await expect(assertDemoSafe(db([DEMO_HOUSEHOLD_ID], [DEMO_USER.id]), {})).resolves.toBeUndefined();
  });
});

describe("isPrismaRequestError", () => {
  it("matches P2xxx codes only", () => {
    expect(isPrismaRequestError(Object.assign(new Error(""), { code: "P2021" }))).toBe(true);
    expect(isPrismaRequestError(Object.assign(new Error(""), { code: "P2002" }))).toBe(true);
    expect(isPrismaRequestError(Object.assign(new Error(""), { code: "P1001" }))).toBe(false);
    expect(isPrismaRequestError(Object.assign(new Error(""), { code: "P20211" }))).toBe(false);
    expect(isPrismaRequestError(Object.assign(new Error(""), { code: "57P03" }))).toBe(false);
    expect(isPrismaRequestError(new Error("no code"))).toBe(false);
    expect(isPrismaRequestError(null)).toBe(false);
  });
});

describe("isDemoRefusal", () => {
  it("matches by name, whatever the class", () => {
    expect(isDemoRefusal(new DemoRefusal("x"))).toBe(true);
    expect(isDemoRefusal(Object.assign(new Error("x"), { name: "DemoRefusal" }))).toBe(true);
    expect(isDemoRefusal(new Error("x"))).toBe(false);
  });
});
