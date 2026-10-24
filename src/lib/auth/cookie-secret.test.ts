import { describe, expect, it } from "vitest";
import { assertUsableCookieSecret } from "./cookie-secret";

describe("assertUsableCookieSecret", () => {
  it("refuses the example value from .env.example", () => {
    expect(() =>
      assertUsableCookieSecret("change-me-min-32-chars-openssl-rand-base64-32")
    ).toThrow(/example value/);
  });

  it("refuses a missing secret", () => {
    expect(() => assertUsableCookieSecret(undefined)).toThrow(/at least 32/);
    expect(() => assertUsableCookieSecret("")).toThrow(/at least 32/);
  });

  it("refuses a secret shorter than 32 characters", () => {
    expect(() => assertUsableCookieSecret("a".repeat(31))).toThrow(/at least 32/);
  });

  it("accepts a non-example 32+ character secret and returns it", () => {
    const secret = "abcdefgh".repeat(5);
    expect(assertUsableCookieSecret(secret)).toBe(secret);
  });

  it("accepts the CI build placeholder, which is not an example value", () => {
    expect(() =>
      assertUsableCookieSecret("cGxhY2Vob2xkZXItc2VjcmV0LWZvcmNpLXRlc3Rpbmctb25seQ==")
    ).not.toThrow();
  });
});
