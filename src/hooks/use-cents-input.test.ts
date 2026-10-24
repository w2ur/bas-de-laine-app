import { describe, it, expect } from "vitest";
import {
  centsFromInput,
  clampCents,
  formatCentsDisplay,
  hiddenValue,
  moneyInputAttributes,
  parsePastedAmount,
  MAX_CENTS,
  MAX_MONEY_CENTS,
} from "./use-cents-input";

describe("clampCents", () => {
  it("clamps to the given ceiling", () => {
    expect(clampCents(100, 50)).toBe(50);
    expect(clampCents(30, 50)).toBe(30);
  });

  it("floors at zero", () => {
    expect(clampCents(-10, MAX_CENTS)).toBe(0);
  });

  it("defaults to MAX_CENTS", () => {
    expect(clampCents(MAX_CENTS + 1)).toBe(MAX_CENTS);
  });

  // Regression: CRITICAL 1 (task-7 review, fix round 1) — a standing amount
  // (treasury balance, pool amount, goal target...) must not be clipped by
  // the per-transaction ceiling; it needs the schemas' MAX_MONEY ceiling.
  it("preserves a value that exceeds the per-transaction ceiling when given the money ceiling", () => {
    const poolCents = 15_000_000; // 150 000 €, a plausible pool balance
    expect(clampCents(poolCents, MAX_CENTS)).toBe(MAX_CENTS); // old, too-low ceiling clips it
    expect(clampCents(poolCents, MAX_MONEY_CENTS)).toBe(poolCents); // correct ceiling preserves it
  });
});

describe("centsFromInput", () => {
  it("reads digits directly as cents", () => {
    expect(centsFromInput("9")).toBe(9);
    expect(centsFromInput("99")).toBe(99);
    expect(centsFromInput("995")).toBe(995);
  });

  it("strips the comma inserted by formatCentsDisplay", () => {
    expect(centsFromInput("9,95")).toBe(995);
    expect(centsFromInput("0,01")).toBe(1);
  });

  it("strips any non-digit character (currency symbol, spaces)", () => {
    expect(centsFromInput("9,95 €")).toBe(995);
    expect(centsFromInput("  12  ")).toBe(12);
  });

  it("returns 0 for an empty or fully non-numeric string", () => {
    expect(centsFromInput("")).toBe(0);
    expect(centsFromInput(",")).toBe(0);
    expect(centsFromInput("abc")).toBe(0);
  });

  it("clamps to the default MAX_CENTS", () => {
    expect(centsFromInput("99999999")).toBe(MAX_CENTS);
    expect(centsFromInput(String(MAX_CENTS))).toBe(MAX_CENTS);
  });

  it("accepts the exact cap value", () => {
    expect(centsFromInput("9999999")).toBe(9999999);
  });

  it("accepts a maxCents override for standing amounts", () => {
    const poolCents = 15_000_000; // 150 000 €, above MAX_CENTS
    expect(centsFromInput(String(poolCents), MAX_MONEY_CENTS)).toBe(poolCents);
    expect(centsFromInput(String(poolCents))).toBe(MAX_CENTS); // default ceiling still clips
  });
});

describe("parsePastedAmount", () => {
  it("reads a comma-decimal amount", () => {
    expect(parsePastedAmount("12,50")).toBe(1250);
  });

  it("reads a dot-decimal amount", () => {
    expect(parsePastedAmount("12.5")).toBe(1250);
  });

  it("strips a currency symbol around a decimal amount", () => {
    expect(parsePastedAmount("9,95 €")).toBe(995);
    expect(parsePastedAmount("€9.95")).toBe(995);
  });

  it("reads digits without a separator directly as cents", () => {
    expect(parsePastedAmount("1250")).toBe(1250);
  });

  it("clamps a decimal amount to MAX_CENTS", () => {
    expect(parsePastedAmount("999999.99")).toBe(MAX_CENTS);
  });

  it("clamps digits-only input to MAX_CENTS", () => {
    expect(parsePastedAmount("99999999")).toBe(MAX_CENTS);
  });

  it("accepts a maxCents override for standing amounts", () => {
    expect(parsePastedAmount("150000,00", MAX_MONEY_CENTS)).toBe(15_000_000);
  });

  it("returns null for an empty or whitespace-only string", () => {
    expect(parsePastedAmount("")).toBeNull();
    expect(parsePastedAmount("   ")).toBeNull();
  });

  it("returns null for text with no usable amount", () => {
    expect(parsePastedAmount("abc")).toBeNull();
    expect(parsePastedAmount(",")).toBeNull();
  });

  // MINOR 4 (task-7 review, fix round 1) — disambiguate thousands vs. decimal separator
  it("reads a European-style amount (thousands dot, decimal comma)", () => {
    expect(parsePastedAmount("1.234,56")).toBe(123456);
  });

  it("reads a US-style amount (thousands comma, decimal dot)", () => {
    expect(parsePastedAmount("1,234.56")).toBe(123456);
  });

  it("rejects a negative amount", () => {
    expect(parsePastedAmount("-12,50")).toBeNull();
    expect(parsePastedAmount("-1250")).toBeNull();
  });

  // Regression: 5a1a668 — only a LEADING "-" was rejected, so a minus
  // after a currency sign or at the end was silently dropped: "€-850" read
  // as 850,00 € (and "€-12,50" as 12,50 €) instead of being refused. A
  // minus sign anywhere now rejects the paste, like the leading-minus rule.
  it("rejects a minus sign anywhere in the pasted text", () => {
    expect(parsePastedAmount("€-850")).toBeNull();
    expect(parsePastedAmount("€-12,50")).toBeNull();
    expect(parsePastedAmount("- 850 €")).toBeNull();
    expect(parsePastedAmount("12,50-")).toBeNull();
    expect(parsePastedAmount("850 −")).toBeNull();
    expect(parsePastedAmount("−850 €")).toBeNull();
  });

  // Regression: 1e1027c — the minus-anywhere rule matched only "-" and
  // U+2212, so an en dash used as a minus ("–850 €", "€–850", common after
  // autocorrect) was dropped and the paste read as +850,00 €. Every dash
  // that can stand for a minus sign now rejects the paste.
  it("rejects en, em and figure dashes and the small/fullwidth hyphen-minus as a minus sign", () => {
    expect(parsePastedAmount("–850 €")).toBeNull();
    expect(parsePastedAmount("€–850")).toBeNull();
    expect(parsePastedAmount("850 — €")).toBeNull();
    expect(parsePastedAmount("‒850")).toBeNull();
    expect(parsePastedAmount("﹣850 €")).toBeNull();
    expect(parsePastedAmount("－12,50")).toBeNull();
  });

  // Regression: fafc6cd — the dash class listed seven code points and
  // missed U+2010 hyphen (PDF text layers), U+2011 non-breaking hyphen
  // (Word's Ctrl+Shift+-) and U+2015 horizontal bar, so "‑850 €" filled
  // +850,00 €. Every Unicode dash, and every other minus sign, now rejects
  // the paste.
  it("rejects every other Unicode dash or minus sign as a minus", () => {
    expect(parsePastedAmount("‐850 €")).toBeNull();
    expect(parsePastedAmount("‑850 €")).toBeNull();
    expect(parsePastedAmount("―850 €")).toBeNull();
    expect(parsePastedAmount("850 ‐ €")).toBeNull();
    expect(parsePastedAmount("€‐12,50")).toBeNull();
    expect(parsePastedAmount("12,50 ‑")).toBeNull();
    expect(parsePastedAmount("﹘850")).toBeNull();
    expect(parsePastedAmount("˗850")).toBeNull();
    expect(parsePastedAmount("➖850")).toBeNull();
    expect(parsePastedAmount("⁻850")).toBeNull();
    expect(parsePastedAmount("₋850")).toBeNull();
  });

  // Regression: 4ad32e0 — a sole separator followed by exactly three
  // digits is a thousands grouping mark, not a decimal point. "1.234" used
  // to read as 1,23 € instead of 1 234,00 €. Comma is excluded from this
  // heuristic since 0dd93b3 (below) — this app's locale is
  // French, where "," is always the decimal separator.
  it("reads a sole dot followed by exactly three digits as thousands grouping", () => {
    expect(parsePastedAmount("1.234")).toBe(123400);
  });

  it("still reads a sole separator followed by one or two digits as a decimal point", () => {
    expect(parsePastedAmount("1.23")).toBe(123);
    expect(parsePastedAmount("1,5")).toBe(150);
  });

  // Regression: 0dd93b3 — a sole comma is this app's decimal
  // separator (French locale), never a thousands grouping mark, however
  // many trailing digits follow it. Before the fix, "1,859" (a unit price
  // copied from a receipt, expecting 1,86 €) was read as 185900 cents
  // (1 859,00 €) — a 1000x error, because a comma followed by exactly three
  // digits was treated the same as a dot.
  it("reads a sole comma followed by exactly three digits as a decimal point, never thousands grouping", () => {
    expect(parsePastedAmount("1,859")).toBe(186);
    expect(parsePastedAmount("1,234")).toBe(123);
  });

  it("still reads both separators as thousands + decimal regardless of trailing digit count", () => {
    expect(parsePastedAmount("1.234,56")).toBe(123456);
    expect(parsePastedAmount("1,234.56")).toBe(123456);
  });

  // Regression: 4ad32e0 — leading-zero / 4+-digit integer part misread as
  // thousands grouping. A sole separator with exactly three trailing digits
  // only reads as thousands grouping when the integer part is 1-3 digits and
  // does not start with "0"; otherwise it is a decimal point.
  it("does not read a leading-zero integer part as thousands grouping", () => {
    expect(parsePastedAmount("0,500")).toBe(50);
    expect(parsePastedAmount("0.500")).toBe(50);
  });

  it("does not read a 4+-digit integer part as thousands grouping", () => {
    expect(parsePastedAmount("1234.567")).toBe(123457);
  });

  // Regression: 2690bca — a trailing "." (or "€.", copied from
  // the end of a sentence) was read as the decimal separator with an empty
  // fraction, and the comma before it as grouping: "12,50 €." used to read
  // as 1 250,00 €, a 100x error. Cutting the text down to the span from its
  // first digit to its last digit, before counting separators, removes the
  // trailing junk so the remaining comma is read normally.
  it("ignores trailing non-digit junk after the last digit", () => {
    expect(parsePastedAmount("12,50 €.")).toBe(1250);
    expect(parsePastedAmount("1 234,56.")).toBe(123456);
  });

  // Regression: 2690bca — the same character repeated more
  // than once can only be grouping, never a decimal point: "1.234.567" used
  // to read its last dot as the decimal point (1 234,57 €), a 1000x-too-low
  // error, instead of 1 234 567,00 €.
  it("reads a separator repeated more than once as grouping, never a decimal point", () => {
    // 1 234 567 € exceeds the per-transaction ceiling (MAX_CENTS); use the
    // standing-amount ceiling so the assertion isolates the parsing rule.
    expect(parsePastedAmount("1.234.567", MAX_MONEY_CENTS)).toBe(123456700);
  });

  // Regression: 2690bca — a space between digit groups with
  // no comma or dot at all is French thousands grouping ("1 234 €", the
  // most common French way to write a round amount), not digits-as-cents.
  it("reads a space between digit groups as thousands grouping when there is no other separator", () => {
    expect(parsePastedAmount("1 234 €")).toBe(123400);
  });

  it("still reads digits with no separator and no space directly as cents", () => {
    expect(parsePastedAmount("1250")).toBe(1250);
  });

  // Regression: f40b7eb — an amount pasted with an explicit currency
  // marker and no decimal separator read 100x differently by magnitude:
  // "1 500 €" -> 1 500,00 € (grouping), but "850 €" -> 8,50 € and
  // "12 €" -> 0,12 € (digits-as-cents). A marker outside the digits means
  // whole euros whatever the grouping; a bare digit string keeps
  // digits-as-cents (above).
  it("reads digits with a currency marker outside them and no decimal separator as whole euros", () => {
    expect(parsePastedAmount("500 €")).toBe(50000);
    expect(parsePastedAmount("€500")).toBe(50000);
    expect(parsePastedAmount("850 €")).toBe(85000);
    expect(parsePastedAmount("850€")).toBe(85000);
    expect(parsePastedAmount("12 €")).toBe(1200);
    expect(parsePastedAmount("10 €.")).toBe(1000);
    expect(parsePastedAmount("850 EUR")).toBe(85000);
    expect(parsePastedAmount("EUR 850")).toBe(85000);
    expect(parsePastedAmount("1 850 €")).toBe(185000);
  });

  // Regression: 317f5ce — f40b7eb's currency-marker branch read every
  // digit as whole euros whatever the spacing, bypassing bda1c3f's
  // three-digit-group check: "12 50 €" (superscript cents copied from a
  // retail price) read as 1 250,00 € instead of 12,50 €. The euro reading
  // now applies only to one digit run or a valid thousands grouping.
  it("does not join irregularly spaced digit groups into whole euros when a currency marker is present", () => {
    expect(parsePastedAmount("12 50 €")).toBe(1250);
    expect(parsePastedAmount("€12 50")).toBe(1250);
    expect(parsePastedAmount("€ 12 50")).toBe(1250);
    expect(parsePastedAmount("12 5 €")).toBe(125);
    expect(parsePastedAmount("1 23 €")).toBe(123);
    expect(parsePastedAmount("12 34 €")).toBe(1234);
    expect(parsePastedAmount("1 850 €")).toBe(185000);
    expect(parsePastedAmount("850 €")).toBe(85000);
  });

  // Regression: 202a127 — only "€" and "EUR" counted as a currency marker,
  // so the spelled-out French form a user pastes from an SMS ("850 euros")
  // still read as 8,50 € while "850 €" read as 850,00 €.
  it("treats 'euro' / 'euros' (any case) as a currency marker", () => {
    expect(parsePastedAmount("850 euros")).toBe(85000);
    expect(parsePastedAmount("850 Euros")).toBe(85000);
    expect(parsePastedAmount("850 EURO")).toBe(85000);
    expect(parsePastedAmount("euro 850")).toBe(85000);
    expect(parsePastedAmount("1 850 euros")).toBe(185000);
    // Controls: "eur" inside a word is not a marker.
    expect(parsePastedAmount("Heure 850")).toBe(850);
    expect(parsePastedAmount("Montant 850")).toBe(850);
  });

  // Regression: bda1c3f — a regression from the round-2 N3
  // span trim. Stripping leading non-digit characters also stripped a lone
  // "," or "." that sits immediately before the first digit and is the
  // decimal point with an omitted leading zero: ".5" / ",5" (half a euro)
  // used to read as 0,05 €, 10x too low, instead of 0,50 €.
  it("reads a leading separator immediately before the first digit as an omitted leading zero", () => {
    expect(parsePastedAmount(".5")).toBe(50);
    expect(parsePastedAmount(",5")).toBe(50);
  });

  // Regression: bda1c3f — a regression from the round-2 N3
  // space-grouping rule. The rule fired for any whitespace in the span,
  // including whitespace around a "€" used informally as the decimal mark:
  // "12 €50" / "12 € 50" used to read as 1 250,00 €, 100x too high, instead
  // of 12,50 €. Whitespace is grouping only when every group after the
  // first has exactly three digits ("1 234" -> 1 234,00 €, kept working).
  it("does not read whitespace around a currency sign used as the decimal mark as thousands grouping", () => {
    expect(parsePastedAmount("12 €50")).toBe(1250);
    expect(parsePastedAmount("12 € 50")).toBe(1250);
  });

  it("still reads a genuine thousands-grouped amount with a currency sign", () => {
    expect(parsePastedAmount("1 234 €")).toBe(123400);
    expect(parsePastedAmount("12 500")).toBe(1250000);
  });
});

describe("formatCentsDisplay", () => {
  it("formats zero as 0,00", () => {
    expect(formatCentsDisplay(0)).toBe("0,00");
  });

  it("formats 1 cent as 0,01", () => {
    expect(formatCentsDisplay(1)).toBe("0,01");
  });

  it("formats 100 cents as 1,00", () => {
    expect(formatCentsDisplay(100)).toBe("1,00");
  });

  it("formats 1234 as 12,34", () => {
    expect(formatCentsDisplay(1234)).toBe("12,34");
  });

  it("formats 9999999 as 99999,99", () => {
    expect(formatCentsDisplay(9999999)).toBe("99999,99");
  });

  it("uses comma as decimal separator (not period)", () => {
    expect(formatCentsDisplay(150)).not.toContain(".");
    expect(formatCentsDisplay(150)).toContain(",");
  });
});

describe("hiddenValue", () => {
  it("formats the amount normally when not required", () => {
    expect(hiddenValue(995, false)).toBe("9.95");
    expect(hiddenValue(0, false)).toBe("0.00");
  });

  it("formats the amount normally when required and non-zero", () => {
    expect(hiddenValue(995, true)).toBe("9.95");
  });

  // IMPORTANT 2 (task-7 review, fix round 1) — a required field left at
  // zero must submit an empty string so native `required` validation on the
  // visible input fires, instead of silently creating a zero-amount record.
  it("submits an empty string for a required field left at zero", () => {
    expect(hiddenValue(0, true)).toBe("");
  });
});

describe("moneyInputAttributes", () => {
  // Regression: CRITICAL (task-7 review, fix round 2) — pattern="[0-9]*"
  // anchors against the *whole* input value, but the displayed value is a
  // comma-separated string produced by formatCentsDisplay ("9,95"), so the
  // pattern made every non-zero amount a patternMismatch and silently
  // blocked native form submission. inputMode="numeric" alone already gives
  // the numeric keypad on mobile; a `pattern` attribute must never come back.
  it("a non-zero display value contains a comma while the input carries no pattern attribute", () => {
    expect(formatCentsDisplay(995)).toContain(",");
    expect(moneyInputAttributes()).not.toHaveProperty("pattern");
  });

  it("keeps inputMode numeric so mobile shows the numeric keypad", () => {
    expect(moneyInputAttributes().inputMode).toBe("numeric");
  });

  it("keeps type text (a numeric type would strip the comma display)", () => {
    expect(moneyInputAttributes().type).toBe("text");
  });
});
