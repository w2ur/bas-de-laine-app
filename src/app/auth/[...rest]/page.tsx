import { redirect } from "next/navigation";

/**
 * Catch-all for the /auth/* routes the Neon Auth UI used to render (sign-up,
 * forgot-password, email-otp, sign-out, …). This app has exactly one entry point —
 * the OTP sign-in page — so every other path funnels back to it instead of 404ing.
 *
 * /auth/callback is not handled here on purpose: the OTP flow completes through the
 * /api/auth proxy (POST sign-in/email-otp sets the cookies directly) and no social
 * provider is configured, so nothing ever redirects to it. If a provider is added
 * later, give it a real route before it lands in this catch-all.
 */
export default function AuthCatchAllPage(): never {
  redirect("/auth/sign-in");
}
