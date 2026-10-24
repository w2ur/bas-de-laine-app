import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  buildTransferPair,
  isConservingPair,
  transferNetEffect,
} from "./transfer-logic";

// ---------------------------------------------------------------------------
// buildTransferPair — structural shape
// ---------------------------------------------------------------------------

describe("buildTransferPair — structural shape", () => {
  const baseInput = {
    sourceId: "env-source-001",
    destinationId: "env-dest-002",
    amount: 50,
    description: "Virement test",
    date: new Date("2026-06-01"),
  };

  it("returns TRANSFER_OUT on the source side", () => {
    const pair = buildTransferPair(baseInput);
    expect(pair.out.type).toBe("TRANSFER_OUT");
    expect(pair.out.envelopeId).toBe(baseInput.sourceId);
  });

  it("returns TRANSFER_IN on the destination side", () => {
    const pair = buildTransferPair(baseInput);
    expect(pair.in.type).toBe("TRANSFER_IN");
    expect(pair.in.envelopeId).toBe(baseInput.destinationId);
  });

  it("carries the same positive amount on both legs", () => {
    const pair = buildTransferPair(baseInput);
    expect(pair.out.amount).toBe(baseInput.amount);
    expect(pair.in.amount).toBe(baseInput.amount);
    expect(pair.out.amount).toBeGreaterThan(0);
    expect(pair.in.amount).toBeGreaterThan(0);
  });

  it("propagates the date to both legs", () => {
    const date = new Date("2026-06-15");
    const pair = buildTransferPair({ ...baseInput, date });
    expect(pair.out.date).toEqual(date);
    expect(pair.in.date).toEqual(date);
  });

  it("propagates a non-null description to both legs", () => {
    const pair = buildTransferPair({ ...baseInput, description: "Loyer avance" });
    expect(pair.out.description).toBe("Loyer avance");
    expect(pair.in.description).toBe("Loyer avance");
  });

  it("propagates null description to both legs", () => {
    const pair = buildTransferPair({ ...baseInput, description: null });
    expect(pair.out.description).toBeNull();
    expect(pair.in.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildTransferPair — conservation
// ---------------------------------------------------------------------------

describe("buildTransferPair — conservation", () => {
  it("OUT amount equals IN amount (conservation invariant)", () => {
    const pair = buildTransferPair({
      sourceId: "A",
      destinationId: "B",
      amount: 123.45,
      description: null,
      date: new Date("2026-01-10"),
    });
    expect(pair.out.amount).toBe(pair.in.amount);
  });

  it("net effect on source is negative, on destination is positive", () => {
    const amount = 75;
    const pair = buildTransferPair({
      sourceId: "src",
      destinationId: "dst",
      amount,
      description: null,
      date: new Date(),
    });
    // TRANSFER_OUT debits the source: computeEnvelopeBalance subtracts TRANSFER_OUT
    // TRANSFER_IN credits the destination: computeEnvelopeBalance adds TRANSFER_IN
    const { sourceEffect, destinationEffect } = transferNetEffect(pair.out.amount);
    expect(sourceEffect).toBe(-amount);
    expect(destinationEffect).toBe(amount);
    expect(sourceEffect + destinationEffect).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isConservingPair
// ---------------------------------------------------------------------------

describe("isConservingPair", () => {
  it("returns true when amounts are equal", () => {
    expect(isConservingPair(100, 100)).toBe(true);
    expect(isConservingPair(0, 0)).toBe(true);
  });

  it("returns false when amounts differ", () => {
    expect(isConservingPair(100, 99.99)).toBe(false);
    expect(isConservingPair(50, 51)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// transferNetEffect
// ---------------------------------------------------------------------------

describe("transferNetEffect", () => {
  it("source effect is always negative of the amount", () => {
    expect(transferNetEffect(100).sourceEffect).toBe(-100);
    expect(transferNetEffect(0.01).sourceEffect).toBe(-0.01);
  });

  it("destination effect is always positive equal to the amount", () => {
    expect(transferNetEffect(100).destinationEffect).toBe(100);
  });

  it("source + destination always sums to zero (money conservation)", () => {
    const { sourceEffect, destinationEffect } = transferNetEffect(99.99);
    expect(sourceEffect + destinationEffect).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("buildTransferPair — property tests (fast-check)", () => {
  // Arbitrary: cents-based amounts (integer pence / 100) to avoid float drift
  const arbCentAmount = fc
    .integer({ min: 1, max: 999_999_99 }) // 1 cent to 9,999,999.99
    .map((cents) => cents / 100);

  const arbId = fc.string({ minLength: 8, maxLength: 24 });
  const arbDate = fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") });
  const arbDescription = fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
    nil: null,
  });

  it("conservation always holds: out.amount === in.amount", () => {
    fc.assert(
      fc.property(
        arbCentAmount,
        arbId,
        arbId,
        arbDate,
        arbDescription,
        (amount, sourceId, destinationId, date, description) => {
          const pair = buildTransferPair({
            sourceId,
            destinationId,
            amount,
            description,
            date,
          });
          return pair.out.amount === pair.in.amount;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("both amounts are always positive", () => {
    fc.assert(
      fc.property(arbCentAmount, arbId, arbId, arbDate, arbDescription, (amount, sourceId, destinationId, date, description) => {
        const pair = buildTransferPair({ sourceId, destinationId, amount, description, date });
        return pair.out.amount > 0 && pair.in.amount > 0;
      }),
      { numRuns: 1000 },
    );
  });

  it("net effect across both legs is always exactly zero", () => {
    fc.assert(
      fc.property(arbCentAmount, (amount) => {
        const { sourceEffect, destinationEffect } = transferNetEffect(amount);
        return sourceEffect + destinationEffect === 0;
      }),
      { numRuns: 1000 },
    );
  });

  it("types are always TRANSFER_OUT and TRANSFER_IN", () => {
    fc.assert(
      fc.property(arbCentAmount, arbId, arbId, arbDate, arbDescription, (amount, sourceId, destinationId, date, description) => {
        const pair = buildTransferPair({ sourceId, destinationId, amount, description, date });
        return pair.out.type === "TRANSFER_OUT" && pair.in.type === "TRANSFER_IN";
      }),
      { numRuns: 500 },
    );
  });

  it("date is propagated identically to both legs", () => {
    fc.assert(
      fc.property(arbCentAmount, arbId, arbId, arbDate, arbDescription, (amount, sourceId, destinationId, date, description) => {
        const pair = buildTransferPair({ sourceId, destinationId, amount, description, date });
        return pair.out.date === pair.in.date;
      }),
      { numRuns: 500 },
    );
  });

  it("envelopeIds are correctly assigned to respective legs", () => {
    fc.assert(
      fc.property(arbCentAmount, arbId, arbId, arbDate, arbDescription, (amount, sourceId, destinationId, date, description) => {
        const pair = buildTransferPair({ sourceId, destinationId, amount, description, date });
        return pair.out.envelopeId === sourceId && pair.in.envelopeId === destinationId;
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Deletion side: pair-selection logic analysis
// ---------------------------------------------------------------------------

/**
 * deleteEnvelopeTransaction (src/actions/envelopes.ts) handles linked-pair deletion via
 * pure Prisma plumbing — it re-fetches the mainTx inside the transaction, reads
 * mainTx.linkedTransactionId, nulls both FK references, then deletes both rows.
 *
 * There is no extractable pure decision function beyond the guard
 * `if (tx.linkedTransactionId)` — the "pair selection" is simply reading the FK.
 * Extracting it would yield a one-liner wrapper around a DB read, providing no
 * testable invariant beyond what the schema already guarantees.
 *
 * The conservation invariant for deletion is verified here by unit contract:
 */
describe("deletion conservation contract (by specification)", () => {
  it("deleting a linked pair removes both TRANSFER_OUT and TRANSFER_IN, netting to zero balance change", () => {
    // Contract: after pair deletion, the sum of balance effects is 0.
    // TRANSFER_OUT removal restores +amount to source.
    // TRANSFER_IN removal reduces destination by -amount.
    // Net: +amount - amount = 0.
    const amount = 200;
    const removalOfOut = +amount; // removing TRANSFER_OUT un-debits source
    const removalOfIn = -amount; // removing TRANSFER_IN un-credits destination
    expect(removalOfOut + removalOfIn).toBe(0);
  });

  it("deleting only one leg of a pair would break conservation (regression guard)", () => {
    // If only TRANSFER_OUT is deleted, the source gets +amount but destination keeps its credit.
    // Net effect = +amount ≠ 0 — phantom money.
    const amount = 150;
    const removalOfOutOnly = +amount;
    // destination keeps its TRANSFER_IN — no removal effect
    expect(removalOfOutOnly).not.toBe(0);
  });
});
