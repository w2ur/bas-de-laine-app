import { NextResponse, type NextRequest } from "next/server";
import { NEON_AUTH_SESSION_COOKIE_NAME } from "@neondatabase/auth/server";
import { auth } from "@/lib/auth/instance";

const authMiddleware = auth.middleware({
  loginUrl: "/auth/sign-in",
});

/** True when the middleware answered with a redirect to the sign-in page. */
function isSignInRedirect(request: NextRequest, response: Response): boolean {
  const location = response.headers.get("location");
  if (!location) return false;

  return new URL(location, request.url).pathname.startsWith("/auth/sign-in");
}

export default async function proxy(request: NextRequest) {
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
  ],
};
