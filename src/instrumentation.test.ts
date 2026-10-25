import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DemoRefusal } from "@/lib/demo/guard";

const { ensureDemoSafeMock } = vi.hoisted(() => ({ ensureDemoSafeMock: vi.fn() }));
vi.mock("@/lib/demo/server", () => ({ ensureDemoSafe: ensureDemoSafeMock }));

const { register } = await import("./instrumentation");

beforeEach(() => {
  ensureDemoSafeMock.mockReset();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("register", () => {
  it("fails the server start when the demo guard refuses", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    ensureDemoSafeMock.mockRejectedValue(new DemoRefusal("DEMO_MODE=1 refused: …"));

    await expect(register()).rejects.toThrow(/refused/);
  });

  // Regression: Next.js caches a rejected register() for the whole process, so a
  // database that is down at boot must not brick the demo until a restart.
  it.each([
    ["a socket error", Object.assign(new Error(""), { code: "ECONNREFUSED" })],
    ["an error with no code", new Error("something unexpected")],
    ["Postgres 57P03 (the database is starting up)", Object.assign(new Error("the database system is starting up"), { code: "57P03" })],
    ["Prisma P1001 (server unreachable)", Object.assign(new Error("Can't reach database server"), { code: "P1001" })],
  ])("logs %s and starts", async (_label, error) => {
    vi.stubEnv("DEMO_MODE", "1");
    ensureDemoSafeMock.mockRejectedValue(error);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(register()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/could not run at startup/), error);
    errorSpy.mockRestore();
  });

  it("fails the start on a schema error (P2021), which no retry will fix", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    ensureDemoSafeMock.mockRejectedValue(Object.assign(new Error("The table `households` does not exist"), { code: "P2021" }));

    await expect(register()).rejects.toThrow(/does not exist/);
  });

  it("refuses a DemoRefusal from another copy of the module (matched by name)", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    // A refusal whose class is not this module's DemoRefusal, carrying a connection
    // code on top: the name alone must make it a refusal.
    const foreign = Object.assign(new Error("DEMO_MODE=1 refused: …"), { name: "DemoRefusal", code: "ECONNREFUSED" });
    ensureDemoSafeMock.mockRejectedValue(foreign);

    await expect(register()).rejects.toBe(foreign);
  });

  it("starts when the demo guard passes", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    ensureDemoSafeMock.mockResolvedValue(undefined);

    await expect(register()).resolves.toBeUndefined();
    expect(ensureDemoSafeMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside DEMO_MODE", async () => {
    vi.stubEnv("DEMO_MODE", "");

    await register();
    expect(ensureDemoSafeMock).not.toHaveBeenCalled();
  });

  it("does nothing on the edge runtime, which has no database driver", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();
    expect(ensureDemoSafeMock).not.toHaveBeenCalled();
  });
});
