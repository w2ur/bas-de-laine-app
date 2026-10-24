export type TreasuryAdjustmentType = "SET" | "DEDUCT" | "REFRESH";

/** Past this many days without a balance write, the treasury total is shown as stale. */
export const TREASURY_STALE_AFTER_DAYS = 30;

const TYPE_LABELS: Record<TreasuryAdjustmentType, string> = {
  SET: "Solde défini",
  DEDUCT: "Déduction",
  REFRESH: "Synchronisation",
};

/** Labels the treasury actions store when the user gives none (`src/actions/treasury.ts`). */
const DEFAULT_LABELS: Partial<Record<TreasuryAdjustmentType, string>> = {
  SET: "Mise à jour du solde",
  REFRESH: "Synchronisation avec les comptes",
};

/**
 * One-line label for an adjustment. A default label already says what the
 * adjustment is, so prefixing the type label would say it twice.
 */
export function adjustmentDisplayLabel(type: TreasuryAdjustmentType, label: string | null): string {
  const trimmed = label?.trim();
  if (!trimmed) return DEFAULT_LABELS[type] ?? TYPE_LABELS[type];
  if (trimmed === DEFAULT_LABELS[type]) return trimmed;
  return `${TYPE_LABELS[type]} — ${trimmed}`;
}

/**
 * When the balance was last written. Every balance write records an
 * adjustment, and a backup restore keeps their createdAt; Treasury.updatedAt
 * and pool rows are reset by a restore, and a pool edit does not touch the total.
 */
export function lastBalanceWrite(adjustments: { createdAt: Date }[]): Date | null {
  if (adjustments.length === 0) return null;
  return new Date(Math.max(...adjustments.map((a) => a.createdAt.getTime())));
}

export function isTreasuryStale(lastWrite: Date | null, now: Date): boolean {
  if (!lastWrite) return false;
  const ageMs = now.getTime() - lastWrite.getTime();
  return ageMs > TREASURY_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
