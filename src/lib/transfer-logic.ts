/**
 * Pure logic for building transfer transaction pairs.
 *
 * Extracted from src/actions/transfers.ts so it can be tested without
 * importing Prisma (which throws without DATABASE_URL).
 *
 * Convention:
 * - A transfer is always two linked records: TRANSFER_OUT (source) and TRANSFER_IN (destination).
 * - Both records carry the same positive amount.
 * - Linkage is symmetric: txOut.linkedTransactionId = txIn.id and txIn.linkedTransactionId = txOut.id.
 * - The circular FK is resolved in three steps inside the DB transaction (create OUT, create IN with
 *   link to OUT, update OUT to link to IN) — this module describes the *data shapes* of those records.
 */

export interface TransferLeg {
  /** UUID of the source envelope (TRANSFER_OUT) or destination envelope (TRANSFER_IN). */
  envelopeId: string;
  /** Always positive: the amount moving between envelopes. */
  amount: number;
  type: "TRANSFER_OUT" | "TRANSFER_IN";
  description: string | null;
  date: Date;
}

export interface TransferPairInput {
  sourceId: string;
  destinationId: string;
  amount: number;
  description: string | null;
  date: Date;
}

export interface TransferPair {
  out: Omit<TransferLeg, "type"> & { type: "TRANSFER_OUT" };
  in: Omit<TransferLeg, "type"> & { type: "TRANSFER_IN" };
}

/**
 * Builds the two data records that constitute a transfer pair.
 *
 * Returns `out` (TRANSFER_OUT, source side) and `in` (TRANSFER_IN, destination side).
 * The caller is responsible for persisting them in the correct order and wiring
 * `linkedTransactionId` symmetrically (step 3 of the circular-FK resolution).
 */
export function buildTransferPair(input: TransferPairInput): TransferPair {
  const shared = {
    amount: input.amount,
    description: input.description,
    date: input.date,
  };

  return {
    out: {
      envelopeId: input.sourceId,
      type: "TRANSFER_OUT",
      ...shared,
    },
    in: {
      envelopeId: input.destinationId,
      type: "TRANSFER_IN",
      ...shared,
    },
  };
}

/**
 * Verifies that a transfer pair is conserving: the OUT amount equals the IN amount,
 * so the net effect on the total balance across all envelopes is zero.
 *
 * Returns true when the pair is balanced, false otherwise.
 */
export function isConservingPair(outAmount: number, inAmount: number): boolean {
  return outAmount === inAmount;
}

/**
 * Computes the net balance change caused by a transfer pair.
 *
 * For a valid pair: TRANSFER_OUT is a debit (negative effect on source),
 * TRANSFER_IN is a credit (positive effect on destination).
 * Net effect across both envelopes combined is always zero.
 *
 * Returns { sourceEffect, destinationEffect } where sourceEffect + destinationEffect === 0.
 */
export function transferNetEffect(amount: number): {
  sourceEffect: number;
  destinationEffect: number;
} {
  return {
    sourceEffect: -amount,
    destinationEffect: amount,
  };
}
