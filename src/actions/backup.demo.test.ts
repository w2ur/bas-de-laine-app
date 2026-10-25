import { describe, it, expect, vi, afterEach } from "vitest";
import { DEMO_IMPORT_DISABLED } from "@/lib/demo/mode";

const { getHouseholdMock, transactionMock } = vi.hoisted(() => ({
  getHouseholdMock: vi.fn(),
  transactionMock: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ getHousehold: getHouseholdMock }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: transactionMock } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { importHouseholdData } = await import("./backup");

afterEach(() => {
  vi.unstubAllEnvs();
  getHouseholdMock.mockReset();
});

describe("importHouseholdData", () => {
  it("refuses in DEMO_MODE before touching the household", async () => {
    vi.stubEnv("DEMO_MODE", "1");

    expect(await importHouseholdData({})).toEqual({ error: DEMO_IMPORT_DISABLED });
    expect(getHouseholdMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("goes on to the household outside DEMO_MODE", async () => {
    getHouseholdMock.mockResolvedValue({ householdId: "h1" });

    // An invalid payload: refused by the schema, after the household check.
    expect(await importHouseholdData({})).toEqual({ error: "Le fichier de sauvegarde est invalide ou corrompu" });
    expect(getHouseholdMock).toHaveBeenCalledTimes(1);
  });
});
