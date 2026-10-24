import { useCallback, useState } from "react";

/** Per-transaction ceiling — used where the amount is a single movement (spend/transfer sheets). */
export const MAX_CENTS = 9_999_999;

/**
 * Cents equivalent of the schemas' MAX_MONEY (9_999_999_999.99). Used as the
 * ceiling for standing amounts — treasury balances, pool amounts, goal
 * targets, income, envelope budgets, fixed charges — which can legitimately
 * exceed a single transaction's ceiling.
 */
export const MAX_MONEY_CENTS = 999_999_999_999;

/**
 * Clamps a cents value to [0, maxCents]. The single source of truth for the
 * invariant "cents never exceeds its field's ceiling" — applied to the
 * initial value on mount (not just on every edit), so display and the
 * submitted value always agree from the very first render.
 */
export function clampCents(cents: number, maxCents: number = MAX_CENTS): number {
  return Math.min(Math.max(cents, 0), maxCents);
}

/**
 * Derives a cents integer from a raw input string, card-machine style:
 * every non-digit character is dropped and the remaining digits are read
 * directly as cents (so typing "9" then "9" then "5" reads "995" -> 9,95 €).
 * Clamped to maxCents.
 */
export function centsFromInput(value: string, maxCents: number = MAX_CENTS): number {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return 0;
  return clampCents(parseInt(digits, 10), maxCents);
}

/**
 * Parses a pasted amount, clamped to maxCents.
 *
 * Before counting separators, the text is cut down to the span from its
 * first digit to its last digit (2690bca) — so trailing junk
 * ("12,50 €.", a value copied from the end of a sentence) is never mistaken
 * for a decimal point.
 *
 * When both a comma and a dot are present exactly once each, the last one
 * is the decimal separator and the earlier one is a thousands grouping and
 * is dropped ("1.234,56" and "1,234.56" both -> 123456 cents). When the
 * SAME separator repeats (more than one dot, or more than one comma), every
 * occurrence is grouping and there is no decimal part at all ("1.234.567"
 * -> 123456700 cents, i.e. 1 234 567,00 €) — a repeated separator can never
 * be a decimal point.
 *
 * With exactly one separator in the whole text, a DOT reads as a thousands
 * grouping mark when followed by exactly three digits AND the integer part
 * is 1–3 digits not starting with "0" ("1.234" -> 123400 cents, i.e.
 * 1 234,00 €); otherwise it is the decimal point ("0.500" -> 50 cents,
 * "1234.567" -> 123457 cents). A sole COMMA is always the decimal point —
 * this app's locale is French, where "," never marks thousands — so
 * "1,234" reads as 1,23 € rather than 1 234,00 €.
 *
 * Without any comma or dot, a currency marker ("€", "EUR", "euro(s)") outside the
 * digits means whole euros when the digits are one run or a valid
 * thousands grouping ("850 €" and "€850" -> 85000 cents, i.e. 850,00 €;
 * "1 500 €" -> 1 500,00 €); irregular groups ("12 50 €") read as if the
 * marker were absent. Otherwise a space (or narrow no-break
 * space) between digit groups is French thousands grouping, but only when
 * every group after the first is exactly three digits ("1 234" -> 123400
 * cents) — not when the whitespace surrounds a currency sign used
 * informally as the decimal mark ("12 €50" / "12 € 50" -> 1250 cents, i.e.
 * 12,50 €, not 125000). A bare digit string with no separator, no space and
 * no currency marker is read directly as cents ("1250" -> 1250 cents),
 * matching centsFromInput.
 *
 * A minus sign anywhere ("-", U+2212, any other Unicode dash or minus) is
 * rejected: negative amounts are not valid money input, and dropping the
 * sign would read "€-850" or "–850 €" as 850,00 €.
 * Returns null when the text carries no usable amount.
 */
/** "€", "EUR", "euro" or "euros" (any case, not inside a word) anywhere in a pasted amount. */
const CURRENCY_MARKER = /€|(?<![a-z])eur(?:os?)?(?![a-z])/i;

export function parsePastedAmount(text: string, maxCents: number = MAX_CENTS): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  // Money fields are positive-only: a minus sign anywhere ("-12,50", "€-850",
  // "12,50-") rejects the paste rather than being dropped. Every Unicode dash
  // counts (general category Pd: hyphen-minus, U+2010 hyphen, U+2011
  // non-breaking hyphen, the figure, en and em dashes, U+2015 horizontal
  // bar, the small and fullwidth forms\u2026), and so does every other minus
  // sign: U+2212 minus, U+02D7 modifier minus, U+207B superscript and
  // U+208B subscript minus, U+2796 heavy minus. A dash used only as a
  // separator ("Total \u2014 850 \u20AC") is rejected too, which fails safe: the
  // paste is ignored and no amount is filled.
  if (/[\p{Pd}\u2212\u02D7\u207B\u208B\u2796]/u.test(trimmed)) return null;

  // Cut trailing junk down to the last digit (2690bca), then
  // do the same for leading junk — except a single "," or "." immediately
  // before the first digit, which is the decimal point with an omitted
  // leading zero, not junk (regression bda1c3f: the span
  // trim used to strip it too, so ".5" / ",5" read as 0,05 € instead of
  // 0,50 €).
  const trailingTrimmed = trimmed.replace(/\D+$/, "");
  const firstDigitIndex = trailingTrimmed.search(/\d/);
  if (firstDigitIndex === -1) return null;
  const charBeforeFirstDigit = trailingTrimmed[firstDigitIndex - 1];
  const spanned =
    charBeforeFirstDigit === "," || charBeforeFirstDigit === "."
      ? `0${trailingTrimmed.slice(firstDigitIndex - 1)}`
      : trailingTrimmed.slice(firstDigitIndex);
  if (spanned === "") return null;

  const commaCount = (spanned.match(/,/g) ?? []).length;
  const dotCount = (spanned.match(/\./g) ?? []).length;
  const separatorCount = commaCount + dotCount;

  if (separatorCount === 1) {
    const separatorIndex = Math.max(spanned.lastIndexOf(","), spanned.lastIndexOf("."));
    const separatorChar = spanned[separatorIndex];
    const beforeDigits = spanned.slice(0, separatorIndex).replace(/\D/g, "");
    const afterDigits = spanned.slice(separatorIndex + 1).replace(/\D/g, "");
    if (beforeDigits === "" && afterDigits === "") return null;

    // Sole DOT, exactly three trailing digits, and a 1-3 digit integer part
    // not starting with "0": thousands grouping, not a decimal point
    // ("1.234" -> 1 234,00 €). A leading zero ("0.500") or a 4+-digit
    // integer part ("1234.567") is never a thousands grouping — those fall
    // through to the decimal reading below. A sole COMMA never takes this
    // branch (regression 0dd93b3): it is always the decimal
    // point in this app's French locale, however many trailing digits
    // follow it ("1,859" -> 1,86 €, not 1 859,00 €).
    if (
      separatorChar === "." &&
      afterDigits.length === 3 &&
      beforeDigits.length >= 1 &&
      beforeDigits.length <= 3 &&
      beforeDigits[0] !== "0"
    ) {
      return clampCents(parseInt(`${beforeDigits}${afterDigits}`, 10) * 100, maxCents);
    }

    const amount = Number(`${beforeDigits || "0"}.${afterDigits}`);
    if (!Number.isFinite(amount)) return null;
    return clampCents(Math.round(amount * 100), maxCents);
  }

  if (separatorCount > 1) {
    // The same separator repeated more than once (and no other separator at
    // all) can only be grouping, never a decimal point (regression
    // 2690bca): "1.234.567" used to read its last dot as the
    // decimal point (1 234,57 €, 1000x too low) instead of 1 234 567,00 €.
    const repeatedSeparatorOnly = (commaCount > 1 && dotCount === 0) || (dotCount > 1 && commaCount === 0);
    if (repeatedSeparatorOnly) {
      const digits = spanned.replace(/\D/g, "");
      if (digits === "") return null;
      return clampCents(parseInt(digits, 10) * 100, maxCents);
    }

    const decimalIndex = Math.max(spanned.lastIndexOf(","), spanned.lastIndexOf("."));
    const integerPart = spanned.slice(0, decimalIndex).replace(/\D/g, "");
    const fractionalPart = spanned.slice(decimalIndex + 1).replace(/\D/g, "");
    if (integerPart === "" && fractionalPart === "") return null;

    const amount = Number(`${integerPart || "0"}.${fractionalPart}`);
    if (!Number.isFinite(amount)) return null;
    return clampCents(Math.round(amount * 100), maxCents);
  }

  const digits = spanned.replace(/\D/g, "");
  if (digits === "") return null;
  const digitsAndSpaces = spanned.replace(/[^\d\s]/g, "");
  // A currency marker OUTSIDE the digits ("850 €", "€500", "12 EUR") with no
  // comma or dot means whole euros: without this, "1 500 €" read as
  // 1 500,00 € but "850 €" as 8,50 €. Only for one digit run or a valid
  // thousands grouping, though: irregular groups ("12 50 €", superscript
  // cents copied from a price) fall through to the rules below, which keep
  // bda1c3f's three-digit-group check (joining them read 100x too high).
  // A marker INSIDE the digits ("12 €50") is the informal decimal mark and
  // also falls through; a bare digit string keeps digits-as-cents.
  const markerOutsideDigits = CURRENCY_MARKER.test(trimmed) && !CURRENCY_MARKER.test(spanned);
  if (markerOutsideDigits && /^(\d+|\d{1,3}(\s\d{3})+)$/.test(digitsAndSpaces)) {
    return clampCents(parseInt(digits, 10) * 100, maxCents);
  }
  // A space (or narrow no-break space) between digit groups with no comma
  // or dot at all is French thousands grouping (regression
  // 2690bca): "1 234 €" -> 1 234,00 €, not 12,34 € (digits-as-cents).
  // Only when every group after the first is exactly three digits, though
  // (regression bda1c3f): whitespace around a currency sign
  // used as the decimal mark ("12 €50", "12 € 50") is not grouping, and
  // reading it as such was 100x too high.
  if (/^\d{1,3}(\s\d{3})+$/.test(digitsAndSpaces)) {
    return clampCents(parseInt(digits, 10) * 100, maxCents);
  }
  return clampCents(parseInt(digits, 10), maxCents);
}

/**
 * Formats a cents integer as a display string with comma decimal separator.
 * e.g. 1234 → "12,34"
 */
export function formatCentsDisplay(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Computes the hidden input's submitted value. A required field left at
 * zero submits an empty string instead of "0.00", so the visible input's
 * native `required` validation can fire instead of silently creating a
 * zero-amount record.
 */
export function hiddenValue(cents: number, required: boolean): string {
  if (required && cents === 0) return "";
  return (cents / 100).toFixed(2);
}

/**
 * Static, non-value attributes for the visible money input. Kept as a pure,
 * testable object so a `pattern` attribute can never silently come back:
 * `pattern="[0-9]*"` anchors against the *whole* value, but the displayed
 * value is a comma-separated string ("9,95"), so it would make every
 * non-zero amount a patternMismatch and block submit natively.
 * `inputMode: "numeric"` alone already gives the numeric keypad on mobile.
 */
export function moneyInputAttributes(): {
  type: "text";
  inputMode: "numeric";
  autoComplete: "off";
} {
  return { type: "text", inputMode: "numeric", autoComplete: "off" };
}

export interface UseCentsInputResult {
  cents: number;
  setCents: (value: number) => void;
  displayAmount: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  reset: () => void;
}

export function useCentsInput(
  initialCents = 0,
  maxCents: number = MAX_CENTS
): UseCentsInputResult {
  const [cents, setCentsState] = useState(() => clampCents(initialCents, maxCents));

  const setCents = useCallback(
    (value: number) => setCentsState(clampCents(value, maxCents)),
    [maxCents]
  );

  const displayAmount = formatCentsDisplay(cents);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCents(centsFromInput(e.target.value, maxCents));
    },
    [maxCents, setCents]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const parsed = parsePastedAmount(e.clipboardData.getData("text"), maxCents);
      if (parsed !== null) {
        setCents(parsed);
      }
    },
    [maxCents, setCents]
  );

  const reset = useCallback(() => {
    setCents(0);
  }, [setCents]);

  return { cents, setCents, displayAmount, onChange, onPaste, reset };
}
