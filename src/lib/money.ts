/**
 * Cent-precision helpers for monetary comparisons.
 *
 * Monetary values are Decimal(12,2) in the database but become IEEE 754
 * doubles after Number() conversion, so direct equality and zero checks
 * accumulate float dust (e.g. 0.1 + 0.2). All comparisons must go through
 * these helpers, which operate at half-cent precision.
 */

const HALF_CENT = 0.005;

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isZeroAmount(value: number): boolean {
  return Math.abs(value) < HALF_CENT;
}

export function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < HALF_CENT;
}

/** True when `a` is greater than `b` by at least half a cent. */
export function amountGreaterThan(a: number, b: number): boolean {
  return a - b >= HALF_CENT;
}
