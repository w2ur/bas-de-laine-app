import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { NEON_AUTH_SESSION_COOKIE_NAME } from "@neondatabase/auth/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const { authMiddlewareSpy } = vi.hoisted(() => ({
  authMiddlewareSpy: vi.fn(() => NextResponse.redirect(new URL("https://app.test/auth/sign-in"))),
}));

vi.mock("@/lib/auth/instance", () => ({
  auth: { middleware: vi.fn(() => authMiddlewareSpy) },
}));

const { default: proxy, config } = await import("@/proxy");


function request(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

describe("proxy", () => {
  beforeEach(() => {
    authMiddlewareSpy.mockClear();
    authMiddlewareSpy.mockReturnValue(
      NextResponse.redirect(new URL("https://app.test/auth/sign-in")),
    );
  });

  // ── The middleware runs for every request ───────────────────────────────────

  // Regression: 1ee9bb0 — @neondatabase/auth 0.4.2-beta forwarded the caller's HTTP
  // method to its GET-only `get-session` endpoint, so Server Action POSTs had to skip
  // the middleware entirely. 0.5.0-beta re-issues the session lookup as a body-less
  // GET, so the bypass is gone and the middleware must now run for Server Actions like
  // any other request. This test guards the opposite of what it used to: a Server
  // Action POST silently skipping auth would be the bug.
  it("runs the auth middleware for Server Action POSTs", async () => {
    await proxy(
      request("https://app.test/enveloppes", {
        method: "POST",
        headers: { "next-action": "7f3a9c1e2b" },
      }),
    );

    expect(authMiddlewareSpy).toHaveBeenCalledTimes(1);
  });

  it("runs the auth middleware for page navigations", async () => {
    await proxy(request("https://app.test/enveloppes"));

    expect(authMiddlewareSpy).toHaveBeenCalledTimes(1);
  });

  it("runs the auth middleware for POSTs that are not Server Actions", async () => {
    await proxy(request("https://app.test/enveloppes", { method: "POST" }));

    expect(authMiddlewareSpy).toHaveBeenCalledTimes(1);
  });

  // ── Transient upstream failures must not sign the family out ────────────────

  it("keeps the sign-in redirect when the request carries no session cookie", async () => {
    const response = await proxy(request("https://app.test/enveloppes"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/sign-in");
  });

  it("lets the request through when a session cookie is present despite the redirect", async () => {
    // The middleware cannot distinguish "no session" from "the Neon Auth server 5xx'd".
    // A request that still carries a session cookie is treated as the latter, and
    // getHousehold() fail-closes on the page or action instead.
    const response = await proxy(
      request("https://app.test/enveloppes", {
        headers: { cookie: `${NEON_AUTH_SESSION_COOKIE_NAME}=deadbeef` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes a non-redirect middleware response straight through", async () => {
    const allowed = NextResponse.next();
    allowed.headers.append("Set-Cookie", `${NEON_AUTH_SESSION_COOKIE_NAME}=refreshed; Path=/`);
    authMiddlewareSpy.mockReturnValue(allowed);

    const response = await proxy(
      request("https://app.test/enveloppes", {
        headers: { cookie: `${NEON_AUTH_SESSION_COOKIE_NAME}=deadbeef` },
      }),
    );

    // Same object: the refreshed session cookie the middleware set must survive.
    expect(response).toBe(allowed);
    expect(response.headers.get("set-cookie")).toContain("refreshed");
  });

  it("keeps a redirect that is not aimed at the sign-in page", async () => {
    authMiddlewareSpy.mockReturnValue(
      NextResponse.redirect(new URL("https://app.test/enveloppes?token=exchanged")),
    );

    const response = await proxy(
      // A gated path: /auth/ pages never reach the middleware (the proxy passes them
      // through outside DEMO_MODE; see proxy.demo.test.ts), so this case lives here.
      request("https://app.test/tresorerie", {
        headers: { cookie: `${NEON_AUTH_SESSION_COOKIE_NAME}=deadbeef` },
      }),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/enveloppes");
  });
});

describe("proxy matcher", () => {
  // Next.js anchors a matcher to the whole path; the pattern is a negative lookahead,
  // so a path is guarded by the proxy exactly when the regex matches it.
  const guarded = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it("guards pages that only start with the letters \"auth\"", () => {
    // Regression: ec450e5 — the exclusion was a bare `auth`
    // prefix, so /authx skipped the proxy and answered a 404 instead of the sign-in redirect.
    expect(guarded("/authx")).toBe(true);
    expect(guarded("/authorize")).toBe(true);
    expect(guarded("/api/authx")).toBe(true);
  });

  it("still lets the sign-in folder and the auth API through", () => {
    expect(guarded("/auth/sign-in")).toBe(false);
    expect(guarded("/auth/anything-else")).toBe(false);
    expect(guarded("/api/auth/get-session")).toBe(false);
  });

  it("still guards the app and lets the PWA assets through", () => {
    expect(guarded("/enveloppes")).toBe(true);
    expect(guarded("/")).toBe(true);
    expect(guarded("/manifest.json")).toBe(false);
    expect(guarded("/icons/icon-192.png")).toBe(false);
  });
});

describe("proxy matcher, both entries, as Next.js evaluates them", () => {
  const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url });
  const runsWith = (entry: string, url: string) => unstable_doesMiddlewareMatch({ config: { matcher: [entry] }, url });

  it("reaches /auth pages through the second entry only", () => {
    expect(runs("/auth/sign-in")).toBe(true);
    expect(runsWith(config.matcher[0], "/auth/sign-in")).toBe(false);
    expect(runsWith(config.matcher[1], "/auth/sign-in")).toBe(true);
    expect(runs("/auth/anything/else")).toBe(true);
  });

  it("never reaches the auth API, through either entry", () => {
    for (const url of ["/api/auth/x", "/api/auth/get-session", "/api/auth/sign-in/email-otp"]) {
      expect(runs(url)).toBe(false);
      expect(runsWith(config.matcher[0], url)).toBe(false);
      expect(runsWith(config.matcher[1], url)).toBe(false);
    }
  });

  it("still reaches the app, and still skips the PWA files", () => {
    expect(runs("/enveloppes")).toBe(true);
    expect(runs("/")).toBe(true);
    expect(runs("/auth")).toBe(true);
    expect(runs("/sw.js")).toBe(false);
    expect(runs("/manifest.json")).toBe(false);
  });
});

describe("proxy on /auth/ pages outside DEMO_MODE", () => {
  beforeEach(() => {
    authMiddlewareSpy.mockClear();
    authMiddlewareSpy.mockReturnValue(NextResponse.redirect(new URL("https://app.test/auth/sign-in")));
  });

  // Regression: the second matcher entry routes /auth/ pages through the proxy. Without
  // the early return, the middleware would answer the signed-out sign-in page with a
  // redirect to itself, a loop.
  it("serves the sign-in page without the middleware, so it cannot redirect to itself", async () => {
    const response = await proxy(request("https://app.test/auth/sign-in"));

    expect(authMiddlewareSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
