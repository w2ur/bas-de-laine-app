import { NextResponse, type NextRequest } from "next/server";
import { NEON_AUTH_SESSION_COOKIE_NAME } from "@neondatabase/auth/server";
import { auth } from "@/lib/auth/instance";
import { demoEnvRefusal, isDemoMode } from "@/lib/demo/mode";

// Null in DEMO_MODE: the demo has no sign-in, and the Neon Auth middleware is never built.
const authMiddleware = isDemoMode()
  ? null
  : auth.middleware({
      loginUrl: "/auth/sign-in",
    });

/**
 * DEMO_MODE: let every request through, unless the env guard refuses, in which case
 * nothing is served at all. The database half of the guard runs in getHousehold(),
 * which every page and Server Action calls before reading data.
 */
function demoProxy(request: NextRequest): NextResponse {
  const refusal = demoEnvRefusal();
  if (refusal) {
    console.error(refusal);
    return new NextResponse("Démo mal configurée", { status: 503 });
  }
  // The demo has no sign-in: send the sign-in page (and the other /auth pages) home.
  if (isAuthPage(request)) {
    return NextResponse.redirect(new URL("/", request.url), 307);
  }
  return NextResponse.next();
}

/** /auth and the pages under it; never /api/auth, which the matcher leaves out. */
function isAuthPage(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

/** True when the middleware answered with a redirect to the sign-in page. */
function isSignInRedirect(request: NextRequest, response: Response): boolean {
  const location = response.headers.get("location");
  if (!location) return false;

  return new URL(location, request.url).pathname.startsWith("/auth/sign-in");
}

export default async function proxy(request: NextRequest) {
  if (authMiddleware === null) return demoProxy(request);

  // The second matcher entry exists for the demo only: outside it, an /auth/ page is
  // passed through untouched, exactly as when the first entry alone excluded it.
  if (request.nextUrl.pathname.startsWith("/auth/")) return NextResponse.next();

  const response = await authMiddleware(request);

  // The middleware answers "not signed in" identically whether the session is really
  // absent or the Neon Auth server 5xx'd, timed out, or could not be reached. When the
  // request still carries a session cookie, read a sign-in redirect as a transient
  // upstream failure and let the request through: a network hiccup must not sign the
  // family out. Nothing is exposed by doing so — every page and Server Action calls
  // getHousehold(), which re-checks the session and fail-closes there.
  if (isSignInRedirect(request, response) && request.cookies.has(NEON_AUTH_SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|icons/|screenshots/|auth/|api/auth/|.*\\.(?:png|svg|ico|webmanifest)$).*)",
    // Only so DEMO_MODE can redirect the sign-in page; a no-op outside it (see above).
    "/auth/:path+",
  ],
};
