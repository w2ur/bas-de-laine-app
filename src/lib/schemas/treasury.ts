import { z } from "zod";
import { MAX_MONEY, positiveMoneyAmount } from "./money";

const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;

export const treasurySetSchema = z.object({
  balance: z
    .coerce
    .number()
    .min(0, "Le solde doit être positif")
    .max(MAX_MONEY, "Montant trop élevé"),
  label: z.string().max(MAX_DESCRIPTION, "500 caractères maximum").optional(),
});

export const treasuryDeductSchema = z.object({
  amount: positiveMoneyAmount(),
  label: z.string().min(1, "Le libellé est requis").max(MAX_DESCRIPTION, "500 caractères maximum"),
});

export type TreasurySetFormValues = z.infer<typeof treasurySetSchema>;
export type TreasuryDeductFormValues = z.infer<typeof treasuryDeductSchema>;

export const treasuryPoolCreateSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(MAX_NAME, "100 caractères maximum"),
  availability: z.enum(["IMMEDIATE", "SHORT", "LONG"], {
    message: "Disponibilité invalide",
  }),
  amount: z
    .coerce
    .number()
    .min(0, "Le montant doit être positif")
    .max(MAX_MONEY, "Montant trop élevé"),
});

export const treasuryPoolUpdateSchema = treasuryPoolCreateSchema.extend({
  id: z.string().min(1),
});

export type TreasuryPoolCreateFormValues = z.infer<typeof treasuryPoolCreateSchema>;
export type TreasuryPoolUpdateFormValues = z.infer<typeof treasuryPoolUpdateSchema>;
