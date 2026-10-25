import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateAccess } from "./access";

const {
  getSessionMock,
  redirectMock,
  findUniqueUserMock,
  createUserMock,
  findFirstHouseholdMock,
  findUniqueHouseholdMock,
  createHouseholdMock,
  findUniqueOrThrowHouseholdMock,
  householdRows,
} = vi.hoisted(() => ({
  // The households table, for the where-respecting findUnique below. Empty by default:
  // a production-shaped database holds no demo row.
  householdRows: [] as { id: string }[],
  findUniqueHouseholdMock: vi.fn(),
  getSessionMock: vi.fn(),
  findUniqueUserMock: vi.fn(),
  createUserMock: vi.fn(),
  findFirstHouseholdMock: vi.fn(),
  createHouseholdMock: vi.fn(),
  findUniqueOrThrowHouseholdMock: vi.fn(),
  // The real redirect() throws NEXT_REDIRECT, which is how it interrupts the caller in
  // both an RSC and a Server Action; the mock has to throw too or getHousehold() would
  // carry on with no user.
  redirectMock: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

// server.ts pulls in next/headers (through ./instance) and Prisma's DATABASE_URL guard
// (through @/lib/prisma); neither resolves under Vitest, so both are mocked away.
vi.mock("./instance", () => ({ auth: { getSession: getSessionMock } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: findUniqueUserMock, create: createUserMock },
    household: {
      findFirst: findFirstHouseholdMock,
      findUnique: findUniqueHouseholdMock,
      create: createHouseholdMock,
      findUniqueOrThrow: findUniqueOrThrowHouseholdMock,
    },
  },
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

/** findUnique that honours its where clause against householdRows. */
function respectWhere() {
  findUniqueHouseholdMock.mockReset().mockImplementation(
    async ({ where }: { where: { id: string } }) => householdRows.find((row) => row.id === where.id) ?? null,
  );
}
respectWhere();

// ALLOWED_EMAILS is parsed once at module load, so it must be set before the import.
process.env.ALLOWED_EMAILS = "alice@example.com";
const { getHousehold } = await import("./server");

describe("evaluateAccess", () => {
  // ── Empty allowlist ─────────────────────────────────────────────────────────

  it("empty allowlist + new user → denied (fail-closed)", () => {
    expect(evaluateAccess("stranger@example.com", [], false)).toBe(false);
  });

  it("empty allowlist + existing user → allowed (family stays functional)", () => {
    expect(evaluateAccess("alice@example.com", [], true)).toBe(true);
  });

  // ── Non-empty allowlist ─────────────────────────────────────────────────────

  it("non-empty allowlist + email in list + new user → allowed", () => {
    const allowlist = ["alice@example.com", "bob@example.com"];
    expect(evaluateAccess("alice@example.com", allowlist, false)).toBe(true);
  });

  it("non-empty allowlist + email in list + existing user → allowed", () => {
    const allowlist = ["alice@example.com", "bob@example.com"];
    expect(evaluateAccess("bob@example.com", allowlist, true)).toBe(true);
  });

  it("non-empty allowlist + email NOT in list + new user → denied", () => {
    const allowlist = ["alice@example.com", "bob@example.com"];
    expect(evaluateAccess("stranger@example.com", allowlist, false)).toBe(false);
  });

  it("non-empty allowlist + email NOT in list + existing user → denied", () => {
    // Even an existing user is blocked when a non-empty allowlist is set and their
    // email is not on it (e.g. family member removed from the list).
    const allowlist = ["alice@example.com"];
    expect(evaluateAccess("bob@example.com", allowlist, true)).toBe(false);
  });

  // ── Whitespace / case handling ──────────────────────────────────────────────

  it("allowlist entries are matched case-insensitively (both sides already normalised)", () => {
    // server.ts normalises with .trim().toLowerCase() before calling evaluateAccess;
    // test that the pure helper itself treats pre-normalised values correctly.
    const allowlist = ["alice@example.com"];
    expect(evaluateAccess("alice@example.com", allowlist, false)).toBe(true);
    expect(evaluateAccess("ALICE@EXAMPLE.COM", allowlist, false)).toBe(false);
  });

  it("allowlist entry with a leading/trailing space does NOT match after the caller trims it", () => {
    // The caller strips whitespace before building the allowlist; verify the helper
    // does not accidentally match an untrimmed value against a trimmed list.
    const allowlist = ["alice@example.com"];
    expect(evaluateAccess(" alice@example.com", allowlist, false)).toBe(false);
  });

  it("empty string email + non-empty allowlist → denied", () => {
    expect(evaluateAccess("", ["alice@example.com"], false)).toBe(false);
  });

  it("empty string email + empty allowlist + no existing user → denied", () => {
    expect(evaluateAccess("", [], false)).toBe(false);
  });
});

describe("getHousehold session handling", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    redirectMock.mockClear();
  });

  it("throws a retryable French error when the auth server answers 5xx", async () => {
    // A 502 means the session could not be read, not that there is no session:
    // signing the family out on an upstream hiccup is the failure mode being avoided.
    getSessionMock.mockResolvedValue({
      data: null,
      error: { message: "Bad Gateway", status: 502, statusText: "Bad Gateway", code: "INTERNAL_ERROR" },
    });

    await expect(getHousehold()).rejects.toThrow(
      "Service d'authentification indisponible, réessayez dans un instant",
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to the sign-in page when there is genuinely no user", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null, user: null }, error: null });

    await expect(getHousehold()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("redirects rather than erroring on a 4xx from the auth server", async () => {
    // 401/403 are legitimate "not signed in" answers — only 5xx is treated as an outage.
    getSessionMock.mockResolvedValue({
      data: null,
      error: { message: "Unauthorized", status: 401, statusText: "Unauthorized", code: "UNAUTHORIZED" },
    });

    await expect(getHousehold()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/auth/sign-in");
  });
});

describe("getHousehold e-mail verification", () => {
  function sessionFor(email: string, emailVerified: boolean | undefined) {
    getSessionMock.mockResolvedValue({
      data: { session: { id: "s1" }, user: { id: "neon-1", email, name: "Alice", emailVerified } },
      error: null,
    });
  }

  beforeEach(() => {
    getSessionMock.mockReset();
    findUniqueUserMock.mockReset().mockResolvedValue(null);
    createUserMock.mockReset().mockResolvedValue({ id: "u1", householdId: "h1" });
    findFirstHouseholdMock.mockReset().mockResolvedValue({ id: "h1" });
    createHouseholdMock.mockReset();
    findUniqueOrThrowHouseholdMock.mockReset().mockResolvedValue({ id: "h1" });
  });

  // Regression: 655c3b9 — an allowlisted address with an
  // unverified e-mail was admitted into the household; the check must run before the
  // allowlist so a mere claim of the address is never enough.
  it("refuses an allowlisted address whose e-mail is not verified, and provisions nothing", async () => {
    sessionFor("alice@example.com", false);

    await expect(getHousehold()).rejects.toThrow("Email non vérifié");
    expect(createUserMock).not.toHaveBeenCalled();
    expect(findFirstHouseholdMock).not.toHaveBeenCalled();
  });

  it("refuses a session whose emailVerified flag is absent", async () => {
    sessionFor("alice@example.com", undefined);

    await expect(getHousehold()).rejects.toThrow("Email non vérifié");
  });

  it("runs the verification before the allowlist (an unverified stranger gets the verification error)", async () => {
    sessionFor("stranger@example.com", false);

    await expect(getHousehold()).rejects.toThrow("Email non vérifié");
  });

  it("admits a verified allowlisted address into the existing household (control)", async () => {
    sessionFor("alice@example.com", true);

    const result = await getHousehold();

    expect(result.householdId).toBe("h1");
    expect(createUserMock).toHaveBeenCalledTimes(1);
  });

  it("still refuses a verified address that is not on the allowlist", async () => {
    sessionFor("stranger@example.com", true);

    await expect(getHousehold()).rejects.toThrow("Email non autorisé");
  });
});

describe("getHousehold provisioning and the demo household", () => {
  const DEMO_HOUSEHOLD_ID = "demo-household";
  const demoCheck = { where: { id: DEMO_HOUSEHOLD_ID }, select: { id: true } };

  beforeEach(() => {
    householdRows.length = 0;
    respectWhere();
    getSessionMock.mockReset().mockResolvedValue({
      data: { session: { id: "s1" }, user: { id: "neon-1", email: "alice@example.com", name: "Alice", emailVerified: true } },
      error: null,
    });
    findUniqueUserMock.mockReset().mockResolvedValue(null);
    createUserMock.mockReset().mockImplementation(async ({ data }: { data: { householdId: string } }) => ({ id: "u1", householdId: data.householdId }));
    findFirstHouseholdMock.mockReset();
    createHouseholdMock.mockReset().mockResolvedValue({ id: "new-household" });
    findUniqueOrThrowHouseholdMock.mockReset().mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }));
  });

  it("first sign-in on a production database: one demo check, then joins the existing household", async () => {
    householdRows.push({ id: "family" });
    findFirstHouseholdMock.mockResolvedValue({ id: "family" });

    expect((await getHousehold()).householdId).toBe("family");
    expect(findUniqueHouseholdMock).toHaveBeenCalledTimes(1);
    expect(findUniqueHouseholdMock).toHaveBeenCalledWith(demoCheck);
    // The original, unfiltered lookup.
    expect(findFirstHouseholdMock).toHaveBeenCalledWith();
    expect(createHouseholdMock).not.toHaveBeenCalled();
  });

  it("first sign-in on an empty database: one demo check, then a new household", async () => {
    findFirstHouseholdMock.mockResolvedValue(null);

    expect((await getHousehold()).householdId).toBe("new-household");
    expect(findUniqueHouseholdMock).toHaveBeenCalledTimes(1);
    expect(createHouseholdMock).toHaveBeenCalledWith({ data: {} });
  });

  // Regression: a database that ran DEMO_MODE and then switched to real sign-in made
  // the first real member join the demo household through findFirst().
  it("refuses a first sign-in while the demo household exists, and provisions nothing", async () => {
    householdRows.push({ id: DEMO_HOUSEHOLD_ID });
    findFirstHouseholdMock.mockResolvedValue({ id: DEMO_HOUSEHOLD_ID });

    await expect(getHousehold()).rejects.toThrow(/données de la démo/);
    expect(findFirstHouseholdMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(createHouseholdMock).not.toHaveBeenCalled();
  });

  it("leaves an existing member alone: no demo check, same household", async () => {
    householdRows.push({ id: DEMO_HOUSEHOLD_ID });
    findUniqueUserMock.mockResolvedValue({ id: "u1", householdId: "family" });

    expect((await getHousehold()).householdId).toBe("family");
    expect(findUniqueHouseholdMock).not.toHaveBeenCalled();
    expect(findFirstHouseholdMock).not.toHaveBeenCalled();
  });
});
