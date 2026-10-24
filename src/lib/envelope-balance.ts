import type { EnvelopeTransactionType } from "@prisma/client";

interface TransactionLike {
  amount: { toString(): string } | number;
  type: EnvelopeTransactionType;
}

/**
 * Computes envelope balance from a list of transactions.
 * balance = sum(FILL) + sum(TRANSFER_IN) - sum(SPEND) - sum(TRANSFER_OUT)
 */
export function computeEnvelopeBalance(transactions: TransactionLike[]): number {
  let balance = 0;
  for (const tx of transactions) {
    const amount = typeof tx.amount === "number" ? tx.amount : Number(tx.amount);
    if (tx.type === "FILL" || tx.type === "TRANSFER_IN") {
      balance += amount;
    } else {
      balance -= amount;
    }
  }
  return balance;
}
