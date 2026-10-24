import { describe, it, expect } from "vitest";
import {
  OTP_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  SIGN_IN_MESSAGES,
  canResend,
  initialSignInState,
  messageForSignInError,
  normaliseEmail,
  resendCountdownSeconds,
  resendLabel,
  sanitiseOtpInput,
  signInReducer,
  type SignInState,
} from "./sign-in-logic";

const T0 = Date.UTC(2026, 8, 13, 10, 0, 0);

/** Walks the reducer from the initial state through `actions`. */
function run(...actions: Parameters<typeof signInReducer>[1][]): SignInState {
  return actions.reduce(signInReducer, initialSignInState);
}

// ---------------------------------------------------------------------------
// normaliseEmail
// ---------------------------------------------------------------------------

describe("normaliseEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normaliseEmail("  jean@example.com  ")).toBe("jean@example.com");
  });

  it("lower-cases the whole address", () => {
    expect(normaliseEmail("Jean.Dupont@Example.COM")).toBe("jean.dupont@example.com");
  });

  it("trims and lower-cases together", () => {
    expect(normaliseEmail(" \tJEAN@EXAMPLE.COM\n")).toBe("jean@example.com");
  });

  it("leaves an already normalised address untouched", () => {
    expect(normaliseEmail("jean@example.com")).toBe("jean@example.com");
  });
});

// ---------------------------------------------------------------------------
// signInReducer — happy path
// ---------------------------------------------------------------------------

describe("signInReducer — idle → sent → verifying", () => {
  it("starts on the email step, idle and error-free", () => {
    expect(initialSignInState).toEqual({
      step: "email",
      pending: false,
      email: "",
      error: null,
      resendAvailableAt: 0,
    });
  });

  it("REQUEST_CODE marks the form pending without leaving the email step", () => {
    const state = run({ type: "REQUEST_CODE" });
    expect(state.pending).toBe(true);
    expect(state.step).toBe("email");
  });

  it("CODE_SENT moves to the code step and stores the normalised address", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "  Jean@Example.COM ", now: T0 }
    );
    expect(state.step).toBe("code");
    expect(state.pending).toBe(false);
    expect(state.email).toBe("jean@example.com");
  });

  it("CODE_SENT arms the resend cooldown", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "jean@example.com", now: T0 }
    );
    expect(state.resendAvailableAt).toBe(T0 + RESEND_COOLDOWN_SECONDS * 1000);
  });

  it("SUBMIT_CODE makes the code step pending", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "jean@example.com", now: T0 },
      { type: "SUBMIT_CODE" }
    );
    expect(state.step).toBe("code");
    expect(state.pending).toBe(true);
    expect(state.error).toBeNull();
  });

  it("SIGNED_IN keeps the form disabled for the hard navigation", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "jean@example.com", now: T0 },
      { type: "SUBMIT_CODE" },
      { type: "SIGNED_IN" }
    );
    expect(state.pending).toBe(true);
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// signInReducer — errors and going back
// ---------------------------------------------------------------------------

describe("signInReducer — error and back", () => {
  it("FAILED on step 1 clears pending and shows the message", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "FAILED", message: SIGN_IN_MESSAGES.invalidEmail }
    );
    expect(state.step).toBe("email");
    expect(state.pending).toBe(false);
    expect(state.error).toBe(SIGN_IN_MESSAGES.invalidEmail);
  });

  it("FAILED on step 2 stays on the code step", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "jean@example.com", now: T0 },
      { type: "SUBMIT_CODE" },
      { type: "FAILED", message: SIGN_IN_MESSAGES.invalidCode }
    );
    expect(state.step).toBe("code");
    expect(state.pending).toBe(false);
    expect(state.error).toBe(SIGN_IN_MESSAGES.invalidCode);
    expect(state.email).toBe("jean@example.com");
  });

  it("a new REQUEST_CODE clears a previous error", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "FAILED", message: SIGN_IN_MESSAGES.fallback },
      { type: "REQUEST_CODE" }
    );
    expect(state.error).toBeNull();
    expect(state.pending).toBe(true);
  });

  it("CHANGE_EMAIL returns to step 1 and drops the cooldown", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "jean@example.com", now: T0 },
      { type: "FAILED", message: SIGN_IN_MESSAGES.invalidCode },
      { type: "CHANGE_EMAIL" }
    );
    expect(state.step).toBe("email");
    expect(state.pending).toBe(false);
    expect(state.error).toBeNull();
    expect(state.resendAvailableAt).toBe(0);
  });

  it("CHANGE_EMAIL keeps the address so the field can be pre-filled", () => {
    const state = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "jean@example.com", now: T0 },
      { type: "CHANGE_EMAIL" }
    );
    expect(state.email).toBe("jean@example.com");
  });
});

// ---------------------------------------------------------------------------
// signInReducer — out-of-order actions are ignored
// ---------------------------------------------------------------------------

describe("signInReducer — guards", () => {
  it("ignores a second REQUEST_CODE while one is in flight", () => {
    const pendingState = run({ type: "REQUEST_CODE" });
    expect(signInReducer(pendingState, { type: "REQUEST_CODE" })).toBe(pendingState);
  });

  it("ignores SUBMIT_CODE while still on the email step", () => {
    expect(signInReducer(initialSignInState, { type: "SUBMIT_CODE" })).toBe(
      initialSignInState
    );
  });

  it("ignores a late FAILED once nothing is in flight", () => {
    const settled = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "jean@example.com", now: T0 }
    );
    expect(signInReducer(settled, { type: "FAILED", message: "boum" })).toBe(settled);
  });

  it("a resend re-arms the cooldown from the new send time", () => {
    const afterFirst = run(
      { type: "REQUEST_CODE" },
      { type: "CODE_SENT", email: "jean@example.com", now: T0 }
    );
    const later = T0 + 60_000;
    const afterResend = [
      { type: "REQUEST_CODE" } as const,
      { type: "CODE_SENT", email: "jean@example.com", now: later } as const,
    ].reduce(signInReducer, afterFirst);

    expect(afterResend.step).toBe("code");
    expect(afterResend.resendAvailableAt).toBe(later + RESEND_COOLDOWN_SECONDS * 1000);
  });
});

// ---------------------------------------------------------------------------
// resend cooldown
// ---------------------------------------------------------------------------

describe("resendCountdownSeconds", () => {
  it("returns the full cooldown at the instant the code is sent", () => {
    expect(resendCountdownSeconds(T0 + 30_000, T0)).toBe(RESEND_COOLDOWN_SECONDS);
  });

  it("rounds a partial second up so the label never shows 0 while disabled", () => {
    expect(resendCountdownSeconds(T0 + 1_200, T0)).toBe(2);
    expect(resendCountdownSeconds(T0 + 1, T0)).toBe(1);
  });

  it("returns 0 exactly at the boundary", () => {
    expect(resendCountdownSeconds(T0, T0)).toBe(0);
  });

  it("returns 0 once the cooldown has passed", () => {
    expect(resendCountdownSeconds(T0, T0 + 5_000)).toBe(0);
  });

  it("returns 0 when no code has been sent yet", () => {
    expect(resendCountdownSeconds(0, T0)).toBe(0);
  });
});

describe("canResend", () => {
  const sent = run(
    { type: "REQUEST_CODE" },
    { type: "CODE_SENT", email: "jean@example.com", now: T0 }
  );

  it("is false during the cooldown", () => {
    expect(canResend(sent, T0 + 1_000)).toBe(false);
  });

  it("is true once the cooldown elapses", () => {
    expect(canResend(sent, T0 + 30_000)).toBe(true);
  });

  it("is false while a request is in flight, cooldown or not", () => {
    const verifying = signInReducer(sent, { type: "SUBMIT_CODE" });
    expect(canResend(verifying, T0 + 60_000)).toBe(false);
  });
});

describe("resendLabel", () => {
  it("shows the countdown while disabled", () => {
    expect(resendLabel(12)).toBe("Renvoyer le code (12 s)");
  });

  it("drops the countdown once available", () => {
    expect(resendLabel(0)).toBe("Renvoyer le code");
  });
});

// ---------------------------------------------------------------------------
// sanitiseOtpInput
// ---------------------------------------------------------------------------

describe("sanitiseOtpInput", () => {
  it("keeps a plain six-digit code untouched", () => {
    expect(sanitiseOtpInput("123456")).toBe("123456");
  });

  it("drops the separator in a pasted '123 456'", () => {
    expect(sanitiseOtpInput("123 456")).toBe("123456");
  });

  it("drops a trailing newline pasted from a mail client", () => {
    expect(sanitiseOtpInput("123456\n")).toBe("123456");
  });

  it("drops letters", () => {
    expect(sanitiseOtpInput("12a3b4c56")).toBe("123456");
  });

  it("caps the result at OTP_LENGTH digits", () => {
    expect(sanitiseOtpInput("1234567890")).toHaveLength(OTP_LENGTH);
    expect(sanitiseOtpInput("1234567890")).toBe("123456");
  });

  it("returns an empty string when nothing is a digit", () => {
    expect(sanitiseOtpInput("  abc  ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// error mapping
// ---------------------------------------------------------------------------

describe("messageForSignInError", () => {
  // What the Neon client actually throws. normalizeBetterAuthError() replaces the
  // better-auth code with one of its own generic codes for anything not in its map
  // (INVALID_OTP and TOO_MANY_ATTEMPTS are both absent from it) while preserving the
  // upstream message — so these are the shapes the UI has to cope with.
  it.each([
    [
      "wrong code",
      { code: "validation_failed", message: "Invalid OTP", status: 400 },
      SIGN_IN_MESSAGES.invalidCode,
    ],
    [
      "expired code",
      { code: "validation_failed", message: "OTP expired", status: 400 },
      SIGN_IN_MESSAGES.invalidCode,
    ],
    [
      "too many attempts",
      { code: "feature_not_supported", message: "Too many attempts", status: 403 },
      SIGN_IN_MESSAGES.attemptsExhausted,
    ],
    [
      "invalid address",
      {
        code: "email_address_invalid",
        message: "Invalid email address format",
        status: 400,
      },
      SIGN_IN_MESSAGES.invalidEmail,
    ],
    [
      "send rate limit",
      {
        code: "over_email_send_rate_limit",
        message: "Too many email requests",
        status: 429,
      },
      SIGN_IN_MESSAGES.rateLimited,
    ],
  ])("maps the thrown Neon error for %s", (_label, error, expected) => {
    expect(messageForSignInError(error)).toBe(expected);
  });

  // Kept in case a response ever surfaces through the typed `{ data, error }` union
  // instead of being thrown.
  it.each([
    ["INVALID_OTP", SIGN_IN_MESSAGES.invalidCode],
    ["OTP_EXPIRED", SIGN_IN_MESSAGES.invalidCode],
    ["OTP_NOT_FOUND", SIGN_IN_MESSAGES.invalidCode],
    ["TOO_MANY_ATTEMPTS", SIGN_IN_MESSAGES.attemptsExhausted],
    ["TOO_MANY_REQUESTS", SIGN_IN_MESSAGES.rateLimited],
    ["INVALID_EMAIL", SIGN_IN_MESSAGES.invalidEmail],
  ])("maps the raw better-auth code %s", (code, expected) => {
    expect(messageForSignInError({ code, status: 400 })).toBe(expected);
  });

  it("matches a reworded upstream message on its substring", () => {
    expect(
      messageForSignInError({ message: "The OTP you entered is not valid", status: 400 })
    ).toBe(SIGN_IN_MESSAGES.invalidCode);
    expect(
      messageForSignInError({ message: "Too many attempts, try later", status: 403 })
    ).toBe(SIGN_IN_MESSAGES.attemptsExhausted);
  });

  // Exhausted attempts destroy the stored code upstream, so "wait a moment" would send
  // the user into a dead end — these two must never collapse into one message.
  it("tells an exhausted-attempts user to ask for a new code, not to wait", () => {
    const exhausted = messageForSignInError({
      code: "feature_not_supported",
      message: "Too many attempts",
      status: 403,
    });
    expect(exhausted).toBe(SIGN_IN_MESSAGES.attemptsExhausted);
    expect(exhausted).not.toBe(SIGN_IN_MESSAGES.rateLimited);
    expect(exhausted).toContain("nouveau code");
  });

  it("still tells a rate-limited user to wait", () => {
    expect(messageForSignInError({ message: "Too many requests", status: 429 })).toBe(
      SIGN_IN_MESSAGES.rateLimited
    );
    expect(
      messageForSignInError({
        code: "over_email_send_rate_limit",
        message: "Too many email requests",
        status: 429,
      })
    ).toBe(SIGN_IN_MESSAGES.rateLimited);
  });

  // A 5xx is the server failing, not the user: its message must not be pattern-matched
  // into an accusation that the code or the address was wrong.
  it.each([
    ["OTP service unavailable", 503],
    ["Email delivery failed", 500],
    ["Internal error", 502],
  ])("returns the generic message for the 5xx '%s'", (message, status) => {
    expect(messageForSignInError({ message, status })).toBe(SIGN_IN_MESSAGES.fallback);
  });

  it("still maps an explicit code on a 5xx response", () => {
    expect(
      messageForSignInError({ code: "INVALID_OTP", message: "boum", status: 500 })
    ).toBe(SIGN_IN_MESSAGES.invalidCode);
  });

  it("maps a bare 429 to the rate-limited message", () => {
    expect(messageForSignInError({ status: 429 })).toBe(SIGN_IN_MESSAGES.rateLimited);
  });

  it("returns the generic message for an unknown code", () => {
    expect(messageForSignInError({ code: "SOMETHING_NEW", status: 500 })).toBe(
      SIGN_IN_MESSAGES.fallback
    );
  });

  it("never leaks an unmapped upstream string into the UI", () => {
    expect(
      messageForSignInError({ message: "Internal server error", status: 500 })
    ).toBe(SIGN_IN_MESSAGES.fallback);
  });

  it("returns the generic message for a thrown network failure", () => {
    expect(messageForSignInError(new TypeError("Failed to fetch"))).toBe(
      SIGN_IN_MESSAGES.fallback
    );
  });

  it("returns the generic message for a null, undefined or non-object error", () => {
    expect(messageForSignInError(null)).toBe(SIGN_IN_MESSAGES.fallback);
    expect(messageForSignInError(undefined)).toBe(SIGN_IN_MESSAGES.fallback);
    expect(messageForSignInError("boum")).toBe(SIGN_IN_MESSAGES.fallback);
  });

  // Every error the email-OTP flow can actually produce must reach a specific message;
  // a regression that demotes one to the fallback leaves the user with no next step.
  it.each([
    ["Invalid OTP", 400],
    ["OTP expired", 400],
    ["Too many attempts", 403],
    ["Too many requests", 429],
    ["Invalid email address format", 400],
  ] as const)("gives '%s' a specific message rather than the fallback", (message, status) => {
    expect(messageForSignInError({ message, status })).not.toBe(
      SIGN_IN_MESSAGES.fallback
    );
  });
});
