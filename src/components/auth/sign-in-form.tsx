"use client";

import { useEffect, useId, useReducer, useState } from "react";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import {
  OTP_LENGTH,
  SIGN_IN_MESSAGES,
  canResend,
  initialSignInState,
  messageForSignInError,
  normaliseEmail,
  resendCountdownSeconds,
  resendLabel,
  sanitiseOtpInput,
  signInReducer,
} from "@/lib/auth/sign-in-logic";

/**
 * Two-step email-OTP sign-in.
 *
 * Talks only to the existing `/api/auth/*` proxy through `authClient` — no new
 * endpoint and no server action, so the allowlist check in getHousehold() remains the
 * single place access is granted.
 */
export function SignInForm() {
  const [state, dispatch] = useReducer(signInReducer, initialSignInState);
  const [emailInput, setEmailInput] = useState("");
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const emailId = useId();
  const codeId = useId();
  const errorId = useId();

  // Ticks only while a cooldown is running, and stops itself once it expires. `now` is
  // seeded from the send handler rather than from here, so the first frame of the
  // countdown is already accurate without a setState inside the effect body.
  useEffect(() => {
    if (state.resendAvailableAt === 0) return;

    const interval = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= state.resendAvailableAt) window.clearInterval(interval);
    }, 500);

    return () => window.clearInterval(interval);
  }, [state.resendAvailableAt]);

  const secondsLeft = resendCountdownSeconds(state.resendAvailableAt, now);

  async function requestCode(rawEmail: string) {
    // The reducer ignores a REQUEST_CODE while one is in flight, but ignoring the
    // action would not stop the fetch below — this is what makes that guard real.
    if (state.pending) return;

    const email = normaliseEmail(rawEmail);
    dispatch({ type: "REQUEST_CODE" });

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });

      if (error) {
        dispatch({ type: "FAILED", message: messageForSignInError(error) });
        return;
      }

      const sentAt = Date.now();
      setCode("");
      setNow(sentAt);
      dispatch({ type: "CODE_SENT", email, now: sentAt });
    } catch (thrown) {
      // This is the path that actually runs on an API error: the Neon client's custom
      // fetch rejects with a normalised AuthApiError on every non-2xx instead of
      // resolving with the `error` half of its own typed union. A network failure
      // lands here too and maps to the generic message.
      dispatch({ type: "FAILED", message: messageForSignInError(thrown) });
    }
  }

  async function handleEmailSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestCode(emailInput);
  }

  async function handleCodeSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "SUBMIT_CODE" });

    try {
      const { error } = await authClient.signIn.emailOtp({
        email: state.email,
        otp: code,
      });

      if (error) {
        dispatch({ type: "FAILED", message: messageForSignInError(error) });
        return;
      }

      dispatch({ type: "SIGNED_IN" });

      // Hard navigation rather than router.push(): the middleware must see the freshly
      // set session cookies, and a client-side transition would reuse the router cache
      // populated while signed out.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/enveloppes");
    } catch (thrown) {
      // See requestCode(): a wrong or expired code arrives here as a thrown error.
      dispatch({ type: "FAILED", message: messageForSignInError(thrown) });
    }
  }

  const errorMessage = state.error ? (
    <p id={errorId} role="alert" className="text-destructive text-sm">
      {state.error}
    </p>
  ) : null;

  return (
    <Card>
      <CardContent>
        {state.step === "email" ? (
          // Keyed on the step so switching steps remounts the form: autoFocus only
          // fires on mount, and without a key React would reuse the same <form> and
          // reconcile the inputs by position instead.
          <form key={state.step} onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={emailId}>Adresse e-mail</Label>
              {/* No `name`: before hydration a submit would be a native GET and put the
                  address in the URL. Autofill keys on autoComplete, not on name. */}
              <Input
                className="h-11 sm:h-9"
                id={emailId}
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="prenom@exemple.fr"
                required
                autoFocus
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                // The browser's native validation bubble is written in the *browser's*
                // UI language, not the document's, so an English-locale phone would
                // show an English message on a French app. Overriding the validity
                // text keeps it French everywhere; it is cleared on input so the field
                // can become valid again.
                onInvalid={(event) =>
                  event.currentTarget.setCustomValidity(
                    event.currentTarget.validity.valueMissing
                      ? SIGN_IN_MESSAGES.missingEmail
                      : SIGN_IN_MESSAGES.invalidEmail
                  )
                }
                onInput={(event) => event.currentTarget.setCustomValidity("")}
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? errorId : undefined}
                disabled={state.pending}
              />
            </div>

            {errorMessage}

            <Button type="submit" className="h-11 w-full sm:h-9" disabled={state.pending}>
              {state.pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Mail className="size-4" aria-hidden="true" />
              )}
              {state.pending ? "Envoi en cours…" : "Recevoir un code"}
            </Button>

            <p className="text-muted-foreground text-center text-xs">
              Un code à {OTP_LENGTH} chiffres vous sera envoyé par e-mail.
            </p>
          </form>
        ) : (
          <form key={state.step} onSubmit={handleCodeSubmit} className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Code envoyé à{" "}
              <span className="text-foreground break-all">{state.email}</span>
            </p>

            <div className="space-y-2">
              <Label htmlFor={codeId}>Code reçu par e-mail</Label>
              {/* No `name`, for the same reason as the address field above. */}
              <Input
                id={codeId}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={OTP_LENGTH}
                placeholder="000000"
                required
                autoFocus
                value={code}
                onChange={(event) => setCode(sanitiseOtpInput(event.target.value))}
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? errorId : undefined}
                disabled={state.pending}
                className="h-11 text-center text-lg tracking-[0.4em] sm:h-9"
              />
            </div>

            {errorMessage}

            <Button
              type="submit"
              className="h-11 w-full sm:h-9"
              disabled={state.pending || code.length !== OTP_LENGTH}
            >
              {state.pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-4" aria-hidden="true" />
              )}
              {state.pending ? "Connexion en cours…" : "Se connecter"}
            </Button>

            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full sm:h-9"
                disabled={!canResend(state, now)}
                onClick={() => requestCode(state.email)}
              >
                {resendLabel(secondsLeft)}
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-11 w-full sm:h-9"
                disabled={state.pending}
                onClick={() => {
                  setEmailInput(state.email);
                  setCode("");
                  dispatch({ type: "CHANGE_EMAIL" });
                }}
              >
                Changer d&apos;adresse
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
