import { z } from "zod";
import { isZeroAmount, roundToCents } from "@/lib/money";

/** Decimal(12,2) ceiling shared by every money field. */
export const MAX_MONEY = 9_999_999_999.99;

/**
 * A strictly positive stored amount: a FILL, SPEND or transfer, a recurring
 * charge, a treasury deduction, a goal target. Stored results go through
 * roundToCents, and an amount that rounds to
 * zero is rejected rather than stored as a 0,00 € row. This is the same
 * round-or-reject rule fillWeek applies (roundFillAmountsOrReject). The UI
 * always sends cents/100; this guards any other caller.
 */
export function positiveMoneyAmount(positiveMessage = "Le montant doit être positif") {
  return z
    .coerce
    .number()
    .positive(positiveMessage)
    .max(MAX_MONEY, "Montant trop élevé")
    .transform(roundToCents)
    .refine((amount) => !isZeroAmount(amount), "Montant invalide");
}
