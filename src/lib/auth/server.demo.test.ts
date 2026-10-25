import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEMO_HOUSEHOLD_ID, DEMO_USER } from "@/lib/demo/mode";

const { getSessionMock, connectionMock, db } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  connectionMock: vi.fn(async () => {}),
  db: {
    household: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), createMany: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), createMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/instance", () => ({ auth: { getSession: getSessionMock } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/server", () => ({ connection: connectionMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const demoHousehold = { id: DEMO_HOUSEHOLD_ID, income: 0 };
const demoUser = { ...DEMO_USER, householdId: DEMO_HOUSEHOLD_ID };
/** The one row getDemoHousehold() reads: the user with its household included. */
const demoRow = { ...demoUser, household: demoHousehold };

async function load() {
  vi.resetModules();
  const [{ getHousehold }, { resetDemoGuardForTests }] = await Promise.all([
    import("./server"),
    import("@/lib/demo/server"),
  ]);
  resetDemoGuardForTests();
  return getHousehold;
}

describe("getHousehold in DEMO_MODE", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("ALLOWED_EMAILS", "");
    for (const model of [db.household, db.user]) for (const fn of Object.values(model)) fn.mockReset();
    getSessionMock.mockReset();
    connectionMock.mockClear();
    db.household.findFirst.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue(null);
    db.user.findUnique.mockResolvedValue(demoRow);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the demo household without reading a session", async () => {
    const getHousehold = await load();

    const result = await getHousehold();

    expect(result).toEqual({ user: demoUser, household: demoHousehold, householdId: DEMO_HOUSEHOLD_ID });
    expect(getSessionMock).not.toHaveBeenCalled();
    // One query: the user with its household.
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: DEMO_USER.id }, include: { household: true } });
    expect(db.household.findUnique).not.toHaveBeenCalled();
    // Opts the page out of build-time prerendering.
    expect(connectionMock).toHaveBeenCalled();
  });

  it("creates the demo household and user on an empty database", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.findUniqueOrThrow.mockResolvedValue(demoRow);
    const getHousehold = await load();

    const result = await getHousehold();

    expect(result).toEqual({ user: demoUser, household: demoHousehold, householdId: DEMO_HOUSEHOLD_ID });
    // skipDuplicates: a concurrent first request creating the same row is not an error.
    expect(db.household.createMany).toHaveBeenCalledWith({ data: [{ id: DEMO_HOUSEHOLD_ID }], skipDuplicates: true });
    expect(db.user.createMany).toHaveBeenCalledWith({
      data: [{ ...DEMO_USER, householdId: DEMO_HOUSEHOLD_ID }],
      skipDuplicates: true,
    });
  });

  it("provisions once when the layout and the page ask at the same time", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.findUniqueOrThrow.mockResolvedValue(demoRow);
    const getHousehold = await load();

    const [a, b] = await Promise.all([getHousehold(), getHousehold()]);

    expect(a.householdId).toBe(DEMO_HOUSEHOLD_ID);
    expect(b.householdId).toBe(DEMO_HOUSEHOLD_ID);
    expect(db.household.createMany).toHaveBeenCalledTimes(1);
    expect(db.user.createMany).toHaveBeenCalledTimes(1);
  });

  it("refuses, before any data read, when the database holds a real household", async () => {
    db.household.findFirst.mockResolvedValue({ id: "cm0realhousehold" });
    const getHousehold = await load();

    await expect(getHousehold()).rejects.toThrow(/household other than the demo/);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses when ALLOWED_EMAILS is set", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "alice@example.com");
    const getHousehold = await load();

    await expect(getHousehold()).rejects.toThrow(/ALLOWED_EMAILS is set/);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("keeps refusing on every call, never caching a refusal as a pass", async () => {
    db.household.findFirst.mockResolvedValue({ id: "cm0realhousehold" });
    const getHousehold = await load();

    await expect(getHousehold()).rejects.toThrow();
    await expect(getHousehold()).rejects.toThrow();
    expect(db.household.findFirst).toHaveBeenCalledTimes(2);
  });

  it("checks the database once per process after a pass", async () => {
    const getHousehold = await load();

    await getHousehold();
    await getHousehold();
    expect(db.household.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("getHousehold outside DEMO_MODE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the Neon Auth session, never the demo household", async () => {
    vi.stubEnv("DEMO_MODE", "0");
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: null,
      error: { message: "Bad Gateway", status: 502, statusText: "Bad Gateway", code: "INTERNAL_ERROR" },
    });
    db.user.findUnique.mockReset();
    const getHousehold = await load();

    await expect(getHousehold()).rejects.toThrow("Service d'authentification indisponible");
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("getHousehold outside DEMO_MODE, over a database that holds the demo", () => {
  const neonUser = { id: "11111111-1111-4111-8111-111111111111", email: "alice@example.com", name: "Alice", emailVerified: true };

  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("ALLOWED_EMAILS", "alice@example.com");
    for (const model of [db.household, db.user]) for (const fn of Object.values(model)) fn.mockReset();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { user: neonUser }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Regression: a self-hoster who tried DEMO_MODE and then switched to real sign-in
  // would have joined the demo's household through household.findFirst().
  it("refuses a first sign-in rather than adopting the demo household", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.household.findUnique.mockResolvedValue({ id: DEMO_HOUSEHOLD_ID });
    // The demo household is the only one, so an unfiltered findFirst would return it.
    db.household.findFirst.mockResolvedValue({ id: DEMO_HOUSEHOLD_ID });
    const getHousehold = await load();

    await expect(getHousehold()).rejects.toThrow(/données de la démo/);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.household.create).not.toHaveBeenCalled();
  });

  it("refuses a member already placed in the demo household", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u1", householdId: DEMO_HOUSEHOLD_ID });
    const getHousehold = await load();

    await expect(getHousehold()).rejects.toThrow(/données de la démo/);
    expect(db.household.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("provisions into the real household when no demo row exists", async () => {
    const real = { id: "cm0realhousehold", income: 0 };
    db.user.findUnique.mockResolvedValue(null);
    db.household.findUnique.mockResolvedValue(null);
    db.household.findFirst.mockResolvedValue(real);
    db.user.create.mockResolvedValue({ id: "u1", householdId: real.id });
    db.household.findUniqueOrThrow.mockResolvedValue(real);
    const getHousehold = await load();

    expect((await getHousehold()).householdId).toBe(real.id);
    expect(db.household.findFirst).toHaveBeenCalledWith();
  });
});
