import { describe, it } from "vitest";
import fc from "fast-check";
import {
  centsFromInput,
  clampCents,
  formatCentsDisplay,
  parsePastedAmount,
  MAX_CENTS,
  MAX_MONEY_CENTS,
} from "./use-cents-input";

describe("property: centsFromInput round-trips formatCentsDisplay", () => {
  it("centsFromInput(formatCentsDisplay(c), maxCents) === c for any cents in range, for either ceiling", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(MAX_CENTS, MAX_MONEY_CENTS).chain((maxCents) =>
          fc.record({ maxCents: fc.constant(maxCents), cents: fc.integer({ min: 0, max: maxCents }) })
        ),
        ({ maxCents, cents }) => {
          return centsFromInput(formatCentsDisplay(cents), maxCents) === cents;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

describe("property: centsFromInput is always within bounds", () => {
  it("never returns a value outside [0, maxCents] for any digit string, for either ceiling", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom(MAX_CENTS, MAX_MONEY_CENTS),
        (value, maxCents) => {
          const cents = centsFromInput(value, maxCents);
          return cents >= 0 && cents <= maxCents;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Regression: 0dd93b3 — a sole comma followed by exactly
// three digits used to be misread as thousands grouping ("1,859" -> 1 859 €
// instead of 1,86 €). This property covers the whole trailing-digit-count
// space a unit test can't enumerate, for any 1-3 digit integer part.
describe("property: parsePastedAmount treats a sole comma as the decimal separator", () => {
  it("never reads a comma-decimal amount as thousands grouping, regardless of trailing digit count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999 }),
        fc.integer({ min: 0, max: 999 }),
        (intPart, fracDigits) => {
          const frac = String(fracDigits).padStart(3, "0");
          const text = `${intPart},${frac}`;
          const expected = clampCents(Math.round(Number(`${intPart}.${frac}`) * 100), MAX_CENTS);
          return parsePastedAmount(text) === expected;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Regression: 2690bca — trailing junk after the last digit
// (a sentence-final ".", "€.") used to be read as the decimal separator
// with an empty fraction, or grouping, changing the parsed amount. Cutting
// the text down to the span from its first digit to its last digit must
// make the result independent of anything appended after that last digit.
describe("property: parsePastedAmount ignores trailing non-digit junk", () => {
  it("gives the same result with or without trailing junk after the last digit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999 }),
        fc.integer({ min: 0, max: 99 }),
        fc.array(fc.constantFrom(" ", "€", ".", ",", "!", "x"), { maxLength: 5 }).map((chars) => chars.join("")),
        (intPart, fracDigits, junk) => {
          const frac = String(fracDigits).padStart(2, "0");
          const text = `${intPart},${frac}`;
          return parsePastedAmount(text) === parsePastedAmount(`${text}${junk}`);
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Regression: bda1c3f — a leading "," or "." immediately
// before the first digit used to be stripped by the span trim along with
// genuine leading junk, so ".5" / ",5" (an omitted leading zero) read as
// 0,05 € instead of 0,50 €. A leading separator must always parse the same
// as the same text with an explicit "0" in front.
describe("property: parsePastedAmount treats a leading separator as an omitted leading zero", () => {
  it("gives the same result with or without an explicit leading zero", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), fc.constantFrom(",", "."), (fracDigits, sep) => {
        const frac = String(fracDigits).padStart(2, "0");
        return parsePastedAmount(`${sep}${frac}`) === parsePastedAmount(`0${sep}${frac}`);
      }),
      { numRuns: 1000 }
    );
  });
});

// Regression: bda1c3f — the round-2 "whitespace is
// grouping" rule fired for any whitespace in the span, including whitespace
// around a "€" used informally as the decimal mark: "12 €50" / "12 € 50"
// read as 1 250,00 €, 100x too high, instead of 12,50 €. An interior
// currency sign (with or without surrounding spaces) must parse the same
// as a comma-decimal amount.
describe("property: parsePastedAmount reads an interior currency sign as a decimal separator", () => {
  it("treats '<int><spacing>€<spacing><frac>' the same as '<int>,<frac>'", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999 }),
        fc.integer({ min: 0, max: 99 }),
        fc.constantFrom("€", " €", "€ ", " € "),
        (intPart, fracDigits, euroSpacing) => {
          const frac = String(fracDigits).padStart(2, "0");
          const expected = parsePastedAmount(`${intPart},${frac}`);
          return parsePastedAmount(`${intPart}${euroSpacing}${frac}`) === expected;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Regression: f40b7eb — a pasted amount with a currency marker and no
// decimal separator read as whole euros only when it happened to carry
// thousands grouping ("1 500 €"); "850 €" read as 8,50 €. With the marker
// outside the digits, any integer must read as that many whole euros.
describe("property: parsePastedAmount reads '<int> €' and '€<int>' as whole euros", () => {
  it("gives int * 100 cents whatever the marker's side and spacing", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99_999 }),
        fc.constantFrom("€", " €", "€ ", " € ", "EUR", " EUR", "EUR ", " eur"),
        fc.boolean(),
        (euros, marker, markerFirst) => {
          const text = markerFirst ? `${marker}${euros}` : `${euros}${marker}`;
          return parsePastedAmount(text) === euros * 100;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Regression: 317f5ce — with a currency marker outside the digits, two
// digit groups that are not a thousands grouping ("12 50 €") were joined
// into whole euros, 100x too high. A marker must not change how such a
// span reads: it parses exactly like the same digits with no marker.
describe("property: parsePastedAmount ignores an outside currency marker on a non-grouping spaced span", () => {
  it("reads '<a> <b>' the same with or without a surrounding marker when <b> is not three digits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999 }),
        fc.oneof(fc.stringMatching(/^\d{1,2}$/), fc.stringMatching(/^\d{4,5}$/)),
        fc.constantFrom("€", " €", "€ ", " EUR", "EUR ", " euros"),
        fc.boolean(),
        (a, b, marker, markerFirst) => {
          const span = `${a} ${b}`;
          const text = markerFirst ? `${marker}${span}` : `${span}${marker}`;
          return parsePastedAmount(text) === parsePastedAmount(span);
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Regression: 1e1027c — only "-" and U+2212 were read as a minus sign, so
// an en or em dash before or after the amount was dropped and the paste
// read as a positive amount. Any minus-like dash, anywhere in an otherwise
// valid amount, must reject the paste.
// Regression: fafc6cd — U+2010 hyphen, U+2011 non-breaking hyphen and
// U+2015 horizontal bar were still dropped, so "‑850 €" read as +850,00 €.
// The generator now draws from every Unicode dash (general category Pd)
// and the other minus signs.
const MINUS_LIKE = [
  "-", // U+002D hyphen-minus
  "֊", // Armenian hyphen
  "־", // Hebrew maqaf
  "᐀", // Canadian syllabics hyphen
  "᠆", // Mongolian todo soft hyphen
  "‐", // hyphen
  "‑", // non-breaking hyphen
  "‒", // figure dash
  "–", // en dash
  "—", // em dash
  "―", // horizontal bar
  "⸗", // double oblique hyphen
  "⸚", // hyphen with diaeresis
  "⸺", // two-em dash
  "⸻", // three-em dash
  "⹀", // double hyphen
  "⹝", // oblique hyphen
  "〜", // wave dash
  "〰", // wavy dash
  "゠", // katakana-hiragana double hyphen
  "︱", // presentation form for vertical em dash
  "︲", // presentation form for vertical en dash
  "﹘", // small em dash
  "﹣", // small hyphen-minus
  "－", // fullwidth hyphen-minus
  "\u{10D6E}", // Garay hyphen
  "\u{10EAD}", // Yezidi hyphenation mark
  "−", // minus sign
  "˗", // modifier letter minus sign
  "⁻", // superscript minus
  "₋", // subscript minus
  "➖", // heavy minus sign
];

describe("property: parsePastedAmount rejects any minus-like dash anywhere", () => {
  it("returns null whatever the dash and wherever it sits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99_999 }),
        fc.constantFrom("", " €", "€", " EUR", ",50"),
        fc.constantFrom(...MINUS_LIKE),
        fc.nat(),
        (euros, suffix, dash, position) => {
          const text = `${euros}${suffix}`;
          const at = position % (text.length + 1);
          return parsePastedAmount(`${text.slice(0, at)}${dash}${text.slice(at)}`) === null;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

describe("property: clampCents is idempotent and always within bounds", () => {
  it("clamping twice equals clamping once, and the result never exceeds maxCents", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: MAX_MONEY_CENTS * 2 }),
        fc.integer({ min: 0, max: MAX_MONEY_CENTS }),
        (cents, maxCents) => {
          const once = clampCents(cents, maxCents);
          const twice = clampCents(once, maxCents);
          return once === twice && once >= 0 && once <= maxCents;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
