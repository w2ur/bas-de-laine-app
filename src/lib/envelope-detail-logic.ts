import { amountGreaterThan, isZeroAmount } from "@/lib/money";

export interface WeekRowDisplay {
  /** Whether the row shows "spent / weekly share" and a progress bar. */
  showQuota: boolean;
  /** Whether the week is flagged as overspent. */
  over: boolean;
  /** Bar width in percent, capped at 100. */
  percent: number;
}

/**
 * How one week of the envelope detail breakdown is displayed.
 *
 * A MONTHLY envelope is filled for the whole month in week 1, so its spending
 * is not paced weekly: comparing one week against a quarter of the budget
 * flags normal spending as an overspend. Only WEEKLY envelopes get a quota.
 */
export function weekRowDisplay(input: {
  spent: number;
  budget: number;
  cadence: "WEEKLY" | "MONTHLY";
}): WeekRowDisplay {
  if (input.cadence === "MONTHLY") {
    return { showQuota: false, over: false, percent: 0 };
  }
  const percent = isZeroAmount(input.budget) ? 0 : Math.min((input.spent / input.budget) * 100, 100);
  return {
    showQuota: true,
    over: amountGreaterThan(input.spent, input.budget),
    percent,
  };
}
