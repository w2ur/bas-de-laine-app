/**
 * Rows for the client components of the configuration pages. A Prisma
 * Decimal cannot cross from a Server Component to a Client Component (React
 * logs « Only plain objects can be passed to Client Components »), so every
 * amount leaves here as a number and only the declared fields are sent.
 */

type Amount = { toString(): string };

export function envelopeManagerRow(e: {
  id: string;
  name: string;
  monthlyBudget: Amount | null;
  icon: string | null;
  color: string | null;
  isArchived: boolean;
  fillCadence: "WEEKLY" | "MONTHLY";
}) {
  return {
    id: e.id,
    name: e.name,
    monthlyBudget: e.monthlyBudget === null ? null : Number(e.monthlyBudget),
    icon: e.icon,
    color: e.color,
    isArchived: e.isArchived,
    fillCadence: e.fillCadence,
  };
}

export function goalManagerRow(g: {
  id: string;
  name: string;
  targetAmount: Amount | null;
  targetDate: Date | null;
  icon: string | null;
  color: string | null;
  isArchived: boolean;
}) {
  return {
    id: g.id,
    name: g.name,
    targetAmount: g.targetAmount === null ? null : Number(g.targetAmount),
    targetDate: g.targetDate,
    icon: g.icon,
    color: g.color,
    isArchived: g.isArchived,
  };
}

export function chargeRow(c: { id: string; name: string; amount: Amount; dayOfMonth: number; active: boolean }) {
  return { id: c.id, name: c.name, amount: Number(c.amount), dayOfMonth: c.dayOfMonth, active: c.active };
}

/** What the active charges take each month, from rows already fetched. */
export function activeChargesTotal(charges: { amount: Amount; active: boolean }[]): number {
  return charges.filter((c) => c.active).reduce((sum, c) => sum + Number(c.amount), 0);
}
