import { z } from "zod";
import { positiveMoneyAmount } from "./money";

const MAX_NAME = 100;

export const chargeSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(MAX_NAME, "100 caractères maximum"),
  amount: positiveMoneyAmount(),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
  active: z.boolean().default(true),
});

export type ChargeFormValues = z.infer<typeof chargeSchema>;
