import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { assertUsableCookieSecret } from "./cookie-secret";
import { isDemoMode } from "@/lib/demo/mode";
import { createDemoAuthStub } from "@/lib/demo/auth-stub";

// Single Neon Auth instance shared by the middleware, the auth API route, and
// server-side session reads. @neondatabase/auth 0.4.x replaced the standalone
// neonAuth()/authApiHandler()/neonAuthMiddleware exports with this factory.
// assertUsableCookieSecret (and createNeonAuth itself) throw on a missing, short or
// example-valued NEON_AUTH_COOKIE_SECRET, so a misconfigured secret fails fast at
// startup rather than silently degrading auth.
//
// In DEMO_MODE nothing may reach Neon Auth and its env vars are not required, so
// createNeonAuth is never called and every use of `auth` fails loudly instead.
export const auth: NeonAuth = isDemoMode() ? createDemoAuthStub() : createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: assertUsableCookieSecret(process.env.NEON_AUTH_COOKIE_SECRET),
    // 0.4.x changed the cookie sameSite default from "lax" to "strict".
    // "strict" drops the session cookie on the cross-site redirect back from the
    // Neon Auth server after email-OTP sign-in, so the app never sees the session
    // and the middleware reroutes to /auth/sign-in. "lax" restores the previous
    // (0.1.x) behavior that the OTP flow relies on.
    sameSite: "lax",
    // Lifetime of the local session-data *cache* cookie, in seconds — how long the
    // middleware trusts its cached copy before re-asking the Neon Auth server. It is
    // NOT the session lifetime: that lives upstream (7 days, sliding) and is not
    // configurable from here. 300 is the package default, pinned explicitly so a
    // future default change cannot silently lengthen or shorten the cache window.
    sessionDataTtl: 300,
  },
});
