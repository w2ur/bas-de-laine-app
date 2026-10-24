/**
 * Pure state and message helpers for the custom OTP sign-in page.
 *
 * Extracted from src/components/auth/sign-in-form.tsx so the step machine, the resend
 * cooldown and the French error mapping can be tested without importing the Neon Auth
 * client (which is "use client" and reaches for browser globals).
 *
 * The flow has exactly two steps:
 * 1. `email` — ask for the address, POST /api/auth/email-otp/send-verification-otp
 * 2. `code`  — ask for the 6-digit code, POST /api/auth/sign-in/email-otp
 *
 * `pending` is the only thing that disables the submit buttons, so every transition
 * that starts a request must set it and every terminal transition must clear it —
 * except SIGNED_IN, which deliberately keeps the form disabled while the hard
 * navigation to /enveloppes is in flight.
 */

/** Seconds the "Renvoyer le code" button stays disabled after a code is sent. */
export const RESEND_COOLDOWN_SECONDS = 30;

const RESEND_COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;

export type SignInStep = "email" | "code";

export interface SignInState {
  step: SignInStep;
  /** True while a request is in flight (or while the post-sign-in navigation runs). */
  pending: boolean;
  /** Normalised address the code was sent to. Empty until the first CODE_SENT. */
  email: string;
  /** French message shown under the form, or null. */
  error: string | null;
  /** Epoch ms before which resending is refused. 0 when no code has been sent yet. */
  resendAvailableAt: number;
}

export const initialSignInState: SignInState = {
  step: "email",
  pending: false,
  email: "",
  error: null,
  resendAvailableAt: 0,
};

export type SignInAction =
  /** The user asked for a code (first request or a resend). */
  | { type: "REQUEST_CODE" }
  /** The upstream accepted the request: move to (or stay on) the code step. */
  | { type: "CODE_SENT"; email: string; now: number }
  /** The user submitted a code. */
  | { type: "SUBMIT_CODE" }
  /** The in-flight request failed; `message` is already French. */
  | { type: "FAILED"; message: string }
  /** The code was accepted; the caller is navigating away. */
  | { type: "SIGNED_IN" }
  /** "Changer d'adresse": back to step 1, cooldown dropped. */
  | { type: "CHANGE_EMAIL" };

/**
 * Trims and lower-cases an address before it is sent upstream or compared.
 *
 * Mobile keyboards happily produce " Jean@Example.COM "; the OTP is issued against the
 * exact string we post, so normalising here keeps the resend and the verify step on the
 * same address, and keeps the allowlist check (src/lib/auth/access.ts, which compares
 * against trimmed lower-cased entries) from rejecting a legitimate family member.
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Step machine for the sign-in form.
 *
 * Out-of-order actions are ignored rather than applied: a late FAILED from an aborted
 * request must not surface an error over a form the user has already moved on from.
 */
export function signInReducer(state: SignInState, action: SignInAction): SignInState {
  switch (action.type) {
    case "REQUEST_CODE":
      if (state.pending) return state;
      return { ...state, pending: true, error: null };

    case "CODE_SENT":
      return {
        ...state,
        step: "code",
        pending: false,
        email: normaliseEmail(action.email),
        error: null,
        resendAvailableAt: action.now + RESEND_COOLDOWN_MS,
      };

    case "SUBMIT_CODE":
      // Only reachable from the code step; a stray submit on step 1 is a no-op.
      if (state.step !== "code" || state.pending) return state;
      return { ...state, pending: true, error: null };

    case "FAILED":
      // Nothing was in flight, so this failure belongs to a superseded request.
      if (!state.pending) return state;
      // `resendAvailableAt` is deliberately left alone: a resend that failed sent no
      // code, and a transient blip should be retryable at once rather than locked
      // behind another 30 s. Hammering is not this reducer's problem to solve — the
      // upstream rate limiter answers 429, which maps to RATE_LIMITED_MESSAGE.
      return { ...state, pending: false, error: action.message };

    case "SIGNED_IN":
      // pending stays true: the hard navigation has not happened yet and the button
      // must not become clickable again in the meantime.
      return { ...state, pending: true, error: null };

    case "CHANGE_EMAIL":
      return {
        ...state,
        step: "email",
        pending: false,
        error: null,
        resendAvailableAt: 0,
      };
  }
}

/** Whole seconds left on the resend cooldown; 0 once resending is allowed. */
export function resendCountdownSeconds(resendAvailableAt: number, now: number): number {
  if (resendAvailableAt <= now) return 0;
  return Math.ceil((resendAvailableAt - now) / 1000);
}

/** True when "Renvoyer le code" may be pressed. */
export function canResend(state: SignInState, now: number): boolean {
  return !state.pending && resendCountdownSeconds(state.resendAvailableAt, now) === 0;
}

/** Label of the resend button, with the countdown while it is on cooldown. */
export function resendLabel(secondsLeft: number): string {
  return secondsLeft > 0
    ? `Renvoyer le code (${secondsLeft} s)`
    : "Renvoyer le code";
}

/** Number of digits in a Neon Auth email OTP. */
export const OTP_LENGTH = 6;

/**
 * Keeps only the digits of what the user typed or pasted, capped at {@link OTP_LENGTH}.
 *
 * Codes are commonly pasted as "123 456" or copied with a trailing newline out of a mail
 * client; the upstream compares the string as-is, so anything but digits is a guaranteed
 * "Code incorrect" the user cannot see the cause of.
 */
export function sanitiseOtpInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

/** The fields we read off a client error, whatever shape it arrived in. */
export interface SignInErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

const INVALID_CODE_MESSAGE = "Code incorrect ou expiré";
// Distinct from RATE_LIMITED below, and the distinction is not cosmetic: better-auth
// *deletes* the stored verification row when the attempt budget runs out
// (node_modules/better-auth/dist/plugins/email-otp/routes.mjs, checkVerificationOtp at
// ~246 and atomicVerifyOTP at ~764 — which is the path sign-in/email-otp takes, and it
// consumes the row without recreating it). Waiting therefore never helps; the only way
// forward is a fresh code, so telling the user to "réessayez dans un instant" would
// send them into a dead end.
const ATTEMPTS_EXHAUSTED_MESSAGE = "Trop de tentatives, demandez un nouveau code";
const RATE_LIMITED_MESSAGE = "Trop de tentatives, réessayez dans un instant";
const INVALID_EMAIL_MESSAGE = "Adresse e-mail invalide";
const MISSING_EMAIL_MESSAGE = "Adresse e-mail requise";
const FALLBACK_MESSAGE = "Connexion impossible pour le moment";

// Two families of `code` reach us, so both are mapped:
//
// - Neon's normalised AuthApiError codes, which is what the client actually throws
//   (normalizeBetterAuthError in node_modules/@neondatabase/auth/dist/better-auth-helpers-*.mjs).
// - better-auth's own plugin codes, in case a response ever surfaces through the typed
//   `{ data, error }` union instead (node_modules/better-auth/dist/plugins/email-otp/error-codes.mjs).
//
// Note what is NOT here: Neon maps an unrecognised code to a *generic* one —
// INVALID_OTP and TOO_MANY_ATTEMPTS both come out as `validation_failed` /
// `feature_not_supported` — so the code alone cannot identify them and the message
// patterns below are load-bearing, not a safety net.
const CODE_MESSAGES: Record<string, string> = {
  // Neon normalised codes
  email_address_invalid: INVALID_EMAIL_MESSAGE,
  over_request_rate_limit: RATE_LIMITED_MESSAGE,
  over_email_send_rate_limit: RATE_LIMITED_MESSAGE,
  // better-auth plugin codes
  INVALID_OTP: INVALID_CODE_MESSAGE,
  OTP_EXPIRED: INVALID_CODE_MESSAGE,
  OTP_NOT_FOUND: INVALID_CODE_MESSAGE,
  TOO_MANY_ATTEMPTS: ATTEMPTS_EXHAUSTED_MESSAGE,
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: ATTEMPTS_EXHAUSTED_MESSAGE,
  TOO_MANY_REQUESTS: RATE_LIMITED_MESSAGE,
  INVALID_EMAIL: INVALID_EMAIL_MESSAGE,
  INVALID_EMAIL_FORMAT: INVALID_EMAIL_MESSAGE,
};

// Matched against the lower-cased English message, in order. Substrings rather than
// exact strings: the wording comes from the upstream Neon Auth server and a reworded
// release must not silently demote a precise message to the generic fallback.
//
// Order is load-bearing: "Too many attempts" means the code was destroyed and must be
// re-requested, while "Too many requests" means wait — so the narrower pattern has to
// be tried before the generic /too many/ one.
const MESSAGE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/too many attempts/, ATTEMPTS_EXHAUSTED_MESSAGE],
  [/too many/, RATE_LIMITED_MESSAGE],
  [/rate limit/, RATE_LIMITED_MESSAGE],
  [/otp|passcode/, INVALID_CODE_MESSAGE],
  [/email.*(invalid|format)|invalid.*email/, INVALID_EMAIL_MESSAGE],
];

/** Reads code/message/status off anything: a thrown AuthApiError or an `{ error }` object. */
function readErrorFields(error: unknown): SignInErrorLike | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
    status: typeof candidate.status === "number" ? candidate.status : undefined,
  };
}

/**
 * Maps a client error to a French message.
 *
 * Accepts `unknown` because the Neon client *throws* on any non-2xx response (its
 * custom fetch rejects with a normalised AuthApiError) rather than resolving with the
 * `{ error }` half of its own typed union — so the same mapping has to serve the catch
 * block and the union.
 *
 * Deliberately lossy: an unmapped upstream error becomes the generic fallback rather
 * than leaking an English server string (or a hint about whether the address exists)
 * into the UI.
 */
export function messageForSignInError(error: unknown): string {
  const fields = readErrorFields(error);
  if (!fields) return FALLBACK_MESSAGE;

  if (fields.code && CODE_MESSAGES[fields.code]) {
    return CODE_MESSAGES[fields.code];
  }

  // A 5xx is the server failing, not the user: its message describes an internal fault
  // and may well contain a word the patterns below match ("otp", "email"), which would
  // blame the user for an outage. Checked before them, after the explicit codes.
  if (fields.status !== undefined && fields.status >= 500) return FALLBACK_MESSAGE;

  if (fields.message) {
    const lower = fields.message.toLowerCase();
    const matched = MESSAGE_PATTERNS.find(([pattern]) => pattern.test(lower));
    if (matched) return matched[1];
  }

  // 429 from a rate limiter that answered before any handler set a code or a message.
  if (fields.status === 429) return RATE_LIMITED_MESSAGE;

  return FALLBACK_MESSAGE;
}

export const SIGN_IN_MESSAGES = {
  invalidCode: INVALID_CODE_MESSAGE,
  attemptsExhausted: ATTEMPTS_EXHAUSTED_MESSAGE,
  rateLimited: RATE_LIMITED_MESSAGE,
  invalidEmail: INVALID_EMAIL_MESSAGE,
  missingEmail: MISSING_EMAIL_MESSAGE,
  fallback: FALLBACK_MESSAGE,
} as const;
