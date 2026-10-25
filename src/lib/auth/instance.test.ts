import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createNeonAuthMock } = vi.hoisted(() => ({
  createNeonAuthMock: vi.fn(() => ({ real: true })),
}));
vi.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: createNeonAuthMock }));

async function loadAuth() {
  vi.resetModules();
  return (await import("./instance")).auth;
}

beforeEach(() => {
  createNeonAuthMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth instance in DEMO_MODE", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "1");
    // The Neon Auth variables are not required in demo mode.
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
  });

  it("loads without the Neon Auth variables and never calls createNeonAuth", async () => {
    await loadAuth();
    expect(createNeonAuthMock).not.toHaveBeenCalled();
  });

  it("answers the auth API with 404", async () => {
    const auth = await loadAuth();
    const { GET, POST } = auth.handler();

    const get = await GET(new Request("https://app.test/api/auth/get-session"), { params: Promise.resolve({ path: ["get-session"] }) });
    const post = await POST(new Request("https://app.test/api/auth/sign-in/email-otp", { method: "POST" }), {
      params: Promise.resolve({ path: ["sign-in", "email-otp"] }),
    });
    expect(get.status).toBe(404);
    expect(post.status).toBe(404);
  });

  it("throws on any other use instead of half-working", async () => {
    const auth = await loadAuth();
    expect(() => auth.middleware({ loginUrl: "/auth/sign-in" })).toThrow(/off in DEMO_MODE/);
    expect(() => auth.getSession()).toThrow(/off in DEMO_MODE/);
  });
});

describe("auth instance outside DEMO_MODE", () => {
  it("still refuses a missing cookie secret at load", async () => {
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
    await expect(loadAuth()).rejects.toThrow(/NEON_AUTH_COOKIE_SECRET/);
  });

  it("builds the real Neon Auth instance", async () => {
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://example.auth.neon.tech");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "abcdefgh".repeat(5));

    const auth = await loadAuth();

    expect(createNeonAuthMock).toHaveBeenCalledTimes(1);
    expect(auth).toEqual({ real: true });
  });
});
