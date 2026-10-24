/**
 * Pure access-control decision function.
 *
 * Rules:
 * - Non-empty allowlist: email must be in the list (for both new and existing users).
 * - Empty allowlist: existing users are allowed (the family stays functional if the
 *   env var is accidentally cleared); new users are denied to prevent open sign-up.
 *
 * @param email        Normalised (trimmed, lower-cased) email of the authenticated user.
 * @param allowlist    Parsed ALLOWED_EMAILS value (trimmed, lower-cased, empty strings filtered).
 * @param userExists   Whether a User row already exists for this identity.
 * @returns true when access should be granted, false when it should be denied.
 */
export function evaluateAccess(
  email: string,
  allowlist: string[],
  userExists: boolean
): boolean {
  if (allowlist.length > 0) {
    return allowlist.includes(email);
  }
  // Empty allowlist: grant only to already-provisioned users.
  return userExists;
}
