import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

// The proxy is the middleware: these tests drive it as Next.js does, one request at a
// time, so the auth gate itself is exercised (a route-handler test never reaches it).
const { middlewareFactory, authMiddlewareSpy } = vi.hoisted(() => {
  const authMiddlewareSpy = vi.fn(async () => NextResponse.redirect(new URL("https://app.test/auth/sign-in")));
  return { authMiddlewareSpy, middlewareFactory: vi.fn(() => authMiddlewareSpy) };
});

vi.mock("@/lib/auth/instance", () => ({ auth: { middleware: middlewareFactory } }));

async function loadProxy() {
  vi.resetModules();
  return (await import("@/proxy")).default;
}

function request(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

beforeEach(() => {
  middlewareFactory.mockClear();
  authMiddlewareSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy in DEMO_MODE", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("ALLOWED_EMAILS", "");
  });

  it("never builds the Neon Auth middleware", async () => {
    await loadProxy();
    expect(middlewareFactory).not.toHaveBeenCalled();
  });

  it("lets an anonymous page navigation through", async () => {
    const proxy = await loadProxy();

    const response = await proxy(request("https://app.test/enveloppes"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(authMiddlewareSpy).not.toHaveBeenCalled();
  });

  it("lets an anonymous Server Action POST through", async () => {
    const proxy = await loadProxy();

    const response = await proxy(
      request("https://app.test/enveloppes", { method: "POST", headers: { "next-action": "7f3a9c1e2b" } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/auth/sign-in", "/auth/forgot-password", "/auth"])("sends %s home with a 307", async (path) => {
    const proxy = await loadProxy();

    const response = await proxy(request(`https://app.test${path}`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/");
  });

  it("serves nothing when ALLOWED_EMAILS is set", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "alice@example.com");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const proxy = await loadProxy();

    const response = await proxy(request("https://app.test/enveloppes"));

    expect(response.status).toBe(503);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/ALLOWED_EMAILS is set/));
    errorSpy.mockRestore();
  });
});

describe("proxy outside DEMO_MODE", () => {
  it("passes /auth/ pages through untouched, without the Neon Auth middleware", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const proxy = await loadProxy();

    const response = await proxy(request("https://app.test/auth/sign-in"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(authMiddlewareSpy).not.toHaveBeenCalled();
  });

  it("still gates a bare /auth with the middleware, as before", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const proxy = await loadProxy();

    const response = await proxy(request("https://app.test/auth"));

    expect(authMiddlewareSpy).toHaveBeenCalledTimes(1);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/sign-in");
  });

  it.each([undefined, "0", "true"])("gates every request with Neon Auth (DEMO_MODE=%s)", async (value) => {
    if (value === undefined) delete process.env.DEMO_MODE;
    else vi.stubEnv("DEMO_MODE", value);
    const proxy = await loadProxy();

    const response = await proxy(request("https://app.test/enveloppes"));

    expect(middlewareFactory).toHaveBeenCalledWith({ loginUrl: "/auth/sign-in" });
    expect(authMiddlewareSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/sign-in");
  });
});

describe("proxy matcher, as Next.js evaluates it", () => {
  it("reaches the /auth pages (for the demo redirect) but never the auth API", async () => {
    const { config } = await import("@/proxy");
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

    expect(matches("/auth/sign-in")).toBe(true);
    expect(matches("/auth/forgot-password")).toBe(true);
    expect(matches("/enveloppes")).toBe(true);
    expect(matches("/api/auth/get-session")).toBe(false);
    expect(matches("/api/auth/sign-in/email-otp")).toBe(false);
    expect(matches("/sw.js")).toBe(false);
  });
});
