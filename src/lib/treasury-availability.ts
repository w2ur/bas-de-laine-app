export const TREASURY_AVAILABILITY = [
  { value: "IMMEDIATE", label: "Immédiat" },
  { value: "SHORT", label: "Court terme" },
  { value: "LONG", label: "Long terme" },
] as const;

export type TreasuryAvailabilityValue =
  (typeof TREASURY_AVAILABILITY)[number]["value"];

export const TREASURY_AVAILABILITY_LABELS: Record<
  TreasuryAvailabilityValue,
  string
> = Object.fromEntries(
  TREASURY_AVAILABILITY.map((a) => [a.value, a.label])
) as Record<TreasuryAvailabilityValue, string>;

export const TREASURY_AVAILABILITY_ORDER: ReadonlyArray<TreasuryAvailabilityValue> =
  TREASURY_AVAILABILITY.map((a) => a.value);

interface PoolBase {
  availability: TreasuryAvailabilityValue;
  amount: number;
}

export interface AvailabilityGroup<T extends PoolBase> {
  tier: TreasuryAvailabilityValue;
  label: string;
  items: T[];
  /** Sum of the tier's amounts, for its section heading. */
  total: number;
}

/**
 * Groups pools by availability tier in canonical display order (IMMEDIATE → SHORT → LONG).
 * Tiers with no pools are omitted.
 */
export function groupPoolsByAvailability<T extends PoolBase>(
  pools: T[]
): AvailabilityGroup<T>[] {
  return TREASURY_AVAILABILITY_ORDER.map((tier) => {
    const items = pools.filter((p) => p.availability === tier);
    return {
      tier,
      label: TREASURY_AVAILABILITY_LABELS[tier],
      items,
      total: items.reduce((sum, p) => sum + p.amount, 0),
    };
  }).filter((g) => g.items.length > 0);
}
