/**
 * Pure helpers for backup import validation and two-pass restore logic.
 * Separated from src/actions/backup.ts so tests can import them without
 * pulling in the Prisma client (which requires DATABASE_URL at import time).
 */

import type { BackupData } from "@/lib/schemas/backup";

/** Pair linking record collected during pass 1 of the restore. */
export interface TransferLink {
  id: string;
  linkedTransactionId: string;
}

/**
 * Collects all (id → linkedTransactionId) pairs from the backup payload.
 * Pass 1 inserts transactions with linkedTransactionId: null;
 * pass 2 applies these links so the non-deferrable FK is never violated.
 */
export function collectTransferLinks(data: BackupData): TransferLink[] {
  return data.envelopes.flatMap((env) =>
    env.transactions
      .filter((t) => t.linkedTransactionId != null)
      .map((t) => ({ id: t.id, linkedTransactionId: t.linkedTransactionId! }))
  );
}

/** Returns the first id that appears more than once in `ids`, or null if all unique. */
function findDuplicateId(ids: string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

/**
 * Validates payload referential integrity: every id must be unique within
 * its own entity array (a corrupted or hand-edited backup could otherwise
 * insert two rows sharing a primary key, which the DB would only catch
 * mid-transaction), every linkedTransactionId must reference a transaction
 * id present in the same backup, and transfer pairs must be symmetric
 * (TRANSFER_IN ↔ TRANSFER_OUT).
 *
 * Returns an error message string if invalid, or null if valid.
 */
export function validatePayloadIntegrity(data: BackupData): string | null {
  const allTransactions = data.envelopes.flatMap((env) => env.transactions);
  const idSet = new Set(allTransactions.map((t) => t.id));
  const typeMap = new Map(allTransactions.map((t) => [t.id, t.type]));

  const duplicateChecks: string[][] = [
    data.envelopes.map((e) => e.id),
    allTransactions.map((t) => t.id),
    data.recurringCharges.map((rc) => rc.id),
    data.treasury?.adjustments.map((a) => a.id) ?? [],
    data.treasury?.pools.map((p) => p.id) ?? [],
  ];
  for (const ids of duplicateChecks) {
    if (findDuplicateId(ids) !== null) {
      return "Données de sauvegarde invalides : des identifiants sont dupliqués dans le fichier";
    }
  }

  for (const tx of allTransactions) {
    if (tx.linkedTransactionId == null) continue;

    // Link must reference a transaction within this backup
    if (!idSet.has(tx.linkedTransactionId)) {
      return "Données de sauvegarde invalides : une transaction liée référence un identifiant absent du fichier";
    }

    // Pairs must be symmetric: one TRANSFER_IN and one TRANSFER_OUT
    const ownType = typeMap.get(tx.id)!;
    const linkedType = typeMap.get(tx.linkedTransactionId)!;
    const isValidPair =
      (ownType === "TRANSFER_OUT" && linkedType === "TRANSFER_IN") ||
      (ownType === "TRANSFER_IN" && linkedType === "TRANSFER_OUT");
    if (!isValidPair) {
      return "Données de sauvegarde invalides : les transactions de transfert ne forment pas de paires symétriques";
    }
  }

  return null;
}
