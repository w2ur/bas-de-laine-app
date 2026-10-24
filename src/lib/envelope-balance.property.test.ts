import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { computeEnvelopeBalance } from "./envelope-balance";

const txTypes = ["FILL", "SPEND", "TRANSFER_IN", "TRANSFER_OUT"] as const;

const arbTransaction = fc.record({
  amount: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  type: fc.constantFrom(...txTypes),
});

const arbTransactions = fc.array(arbTransaction, { minLength: 0, maxLength: 200 });

describe("computeEnvelopeBalance — property tests", () => {
  it("empty list returns 0", () => {
    expect(computeEnvelopeBalance([])).toBe(0);
  });

  it("never returns NaN or Infinity", () => {
    fc.assert(
      fc.property(arbTransactions, (txs) => {
        const result = computeEnvelopeBalance(txs);
        expect(Number.isFinite(result)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("transfer preserves total: balance(A) + balance(B) is constant", () => {
    fc.assert(
      fc.property(
        arbTransactions,
        arbTransactions,
        fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        (txsA, txsB, transferAmount) => {
          const balA = computeEnvelopeBalance(txsA);
          const balB = computeEnvelopeBalance(txsB);
          const totalBefore = balA + balB;

          const balAAfter = computeEnvelopeBalance([
            ...txsA,
            { amount: transferAmount, type: "TRANSFER_OUT" },
          ]);
          const balBAfter = computeEnvelopeBalance([
            ...txsB,
            { amount: transferAmount, type: "TRANSFER_IN" },
          ]);
          const totalAfter = balAAfter + balBAfter;

          // Floating-point tolerance: 1e-6
          expect(Math.abs(totalAfter - totalBefore)).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("FILL and TRANSFER_IN are additive, SPEND and TRANSFER_OUT are subtractive", () => {
    fc.assert(
      fc.property(arbTransactions, (txs) => {
        const balance = computeEnvelopeBalance(txs);
        const positives = txs
          .filter((t) => t.type === "FILL" || t.type === "TRANSFER_IN")
          .reduce((sum, t) => sum + t.amount, 0);
        const negatives = txs
          .filter((t) => t.type === "SPEND" || t.type === "TRANSFER_OUT")
          .reduce((sum, t) => sum + t.amount, 0);

        expect(Math.abs(balance - (positives - negatives))).toBeLessThan(1e-6);
      }),
      { numRuns: 1000 },
    );
  });

  it("works with Decimal-like objects (toString interface)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            amount: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
            type: fc.constantFrom(...txTypes),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        (txs) => {
          const withNumbers = txs.map((t) => ({ amount: t.amount, type: t.type }));
          const withDecimals = txs.map((t) => ({
            amount: { toString: () => String(t.amount) },
            type: t.type,
          }));

          const r1 = computeEnvelopeBalance(withNumbers);
          const r2 = computeEnvelopeBalance(withDecimals);

          expect(Math.abs(r1 - r2)).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 500 },
    );
  });
});
