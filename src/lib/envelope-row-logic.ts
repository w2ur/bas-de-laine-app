import { formatCurrency } from "@/lib/format";
import { amountGreaterThan, isZeroAmount } from "@/lib/money";

export interface EnvelopeRowDisplay {
  /** The muted line under the name. */
  meta: string;
  /** Bar width, 0–100. */
  percent: number;
  /** Balance below zero (overspending is allowed by design). */
  over: boolean;
}

/**
 * The envelope row's meta line and bar. The balance is cumulative (it carries
 * over between months), so the meta states the period's reference on its own
 * and never pairs the balance with it (« reste X sur Y » would read 150 € sur
 * 110 € after a carry-over, and claim a period the balance does not have).
 * The bar is balance over reference, full when the balance exceeds it.
 */
export function envelopeRowMeta({
  balance,
  reference,
  cadence,
}: {
  balance: number;
  /** The weekly indicator (WEEKLY) or the effective monthly budget (MONTHLY). */
  reference: number;
  cadence: "WEEKLY" | "MONTHLY";
}): EnvelopeRowDisplay {
  if (amountGreaterThan(0, balance)) {
    return { meta: `dépassé de ${formatCurrency(-balance)}`, percent: 100, over: true };
  }
  const period = cadence === "MONTHLY" ? "par mois" : "par semaine";
  const percent =
    isZeroAmount(reference) || amountGreaterThan(0, reference) ? 0 : Math.min(Math.max((balance / reference) * 100, 0), 100);
  return { meta: `${formatCurrency(reference)} ${period}`, percent, over: false };
}
