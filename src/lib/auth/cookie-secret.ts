/**
 * Startup guard for NEON_AUTH_COOKIE_SECRET.
 *
 * `createNeonAuth` only checks the length (>= 32 chars). The placeholder in
 * `.env.example` is 45 chars long, so a copied-and-forgotten example value would
 * pass that check and ship a publicly known cookie-signing secret. This refuses it.
 */

const MIN_LENGTH = 32;

/** Prefix shared by the `.env.example` placeholder; any value starting with it is an example. */
const EXAMPLE_PREFIX = "change-me";

/**
 * Returns the secret when it is usable, throws otherwise.
 *
 * @param secret  The raw NEON_AUTH_COOKIE_SECRET value.
 * @throws when the secret is missing, shorter than 32 characters, or the example placeholder.
 */
export function assertUsableCookieSecret(secret: string | undefined): string {
  if (!secret || secret.length < MIN_LENGTH) {
    throw new Error(
      `NEON_AUTH_COOKIE_SECRET must be set to at least ${MIN_LENGTH} characters (generate one with: openssl rand -base64 32).`
    );
  }
  if (secret.startsWith(EXAMPLE_PREFIX)) {
    throw new Error(
      "NEON_AUTH_COOKIE_SECRET is still the example value from .env.example. Generate your own with: openssl rand -base64 32."
    );
  }
  return secret;
}
