import { describe, expect, it } from "vitest";

import {
  amountGreaterThan,
  amountsEqual,
  isZeroAmount,
  roundToCents,
} from "./money";

describe("roundToCents", () => {
  it("rounds float dust to exact cents", () => {
    expect(roundToCents(0.1 + 0.2)).toBe(0.3);
    expect(roundToCents(123.4567)).toBe(123.46);
    expect(roundToCents(-123.4567)).toBe(-123.46);
  });

  it("keeps exact cent values unchanged", () => {
    expect(roundToCents(1234.56)).toBe(1234.56);
    expect(roundToCents(0)).toBe(0);
  });
});

describe("isZeroAmount", () => {
  it("treats float dust as zero", () => {
    expect(isZeroAmount(0.1 + 0.2 - 0.3)).toBe(true);
    expect(isZeroAmount(-0.0000001)).toBe(true);
  });

  it("does not treat half a cent or more as zero", () => {
    expect(isZeroAmount(0.005)).toBe(false);
    expect(isZeroAmount(0.01)).toBe(false);
    expect(isZeroAmount(-0.01)).toBe(false);
  });
});

describe("amountsEqual", () => {
  it("equates values within float dust", () => {
    expect(amountsEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(amountsEqual(100, 100)).toBe(true);
  });

  it("distinguishes values a cent apart", () => {
    expect(amountsEqual(100, 100.01)).toBe(false);
  });
});

describe("amountGreaterThan", () => {
  it("ignores float dust above the threshold", () => {
    expect(amountGreaterThan(0.3, 0.1 + 0.2)).toBe(false);
  });

  it("detects a real one-cent excess", () => {
    expect(amountGreaterThan(100.01, 100)).toBe(true);
    expect(amountGreaterThan(100, 100.01)).toBe(false);
  });
});
