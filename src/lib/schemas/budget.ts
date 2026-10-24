import { z } from "zod";

const MAX_MONEY = 9_999_999_999.99;

export const incomeSchema = z.object({
  income: z
    .coerce
    .number()
    .min(0, "Le revenu doit être positif")
    .max(MAX_MONEY, "Montant trop élevé"),
});

export type IncomeFormValues = z.infer<typeof incomeSchema>;
