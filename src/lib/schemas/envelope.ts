import { z } from "zod";
import { MAX_MONEY, positiveMoneyAmount } from "./money";

const MAX_NAME = 100;
const MAX_DESCRIPTION = 500;

// Calendar-date string "yyyy-MM-dd" parsed as UTC midnight.
// Rejects full ISO timestamps (e.g. "2026-06-01T15:00:00.000Z") to ensure
// the stored date always aligns with the UTC server-side month bounds.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format attendu : AAAA-MM-JJ)")
  .transform((s) => new Date(s));

export const envelopeSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(MAX_NAME, "100 caractères maximum"),
  monthlyBudget: z
    .coerce
    .number()
    .min(0, "Le budget doit être positif")
    .max(MAX_MONEY, "Montant trop élevé"),
  fillCadence: z
    .enum(["WEEKLY", "MONTHLY"], { error: "Cadence de remplissage invalide" })
    .default("WEEKLY"),
  icon: z.string().max(50, "50 caractères maximum").optional(),
  color: z.string().max(100, "100 caractères maximum").optional(),
});

export const goalEnvelopeSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(MAX_NAME, "100 caractères maximum"),
  targetAmount: positiveMoneyAmount("L'objectif doit être positif"),
  targetDate: z.preprocess(
    (val) => (val === "" || val === undefined ? undefined : val),
    z.coerce.date().optional(),
  ),
  icon: z.string().max(50, "50 caractères maximum").optional(),
  color: z.string().max(100, "100 caractères maximum").optional(),
});

export const envelopeTransactionSchema = z.object({
  envelopeId: z.string().min(1),
  amount: positiveMoneyAmount(),
  type: z.enum(["FILL", "SPEND"]),
  description: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().max(MAX_DESCRIPTION, "500 caractères maximum"))
    .optional(),
  date: z.preprocess(
    (val) => (val === undefined || val === "" ? undefined : val),
    calendarDate.optional(),
  ),
});

export const transferSchema = z.object({
  sourceId: z.string().min(1),
  destinationId: z.string().min(1),
  amount: positiveMoneyAmount(),
  description: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .pipe(z.string().max(MAX_DESCRIPTION, "500 caractères maximum"))
    .optional(),
  date: z.preprocess(
    (val) => (val === undefined || val === "" ? undefined : val),
    calendarDate.optional(),
  ),
});

const MAX_FILLS_PER_WEEK = 50;

export const fillWeekSchema = z.object({
  date: calendarDate,
  fills: z
    .array(
      z.object({
        envelopeId: z.string().min(1, "Enveloppe introuvable"),
        amount: z
          .number()
          .positive("Le montant doit être positif")
          .max(MAX_MONEY, "Montant trop élevé"),
        // The sum of FILLs the client saw for this envelope in its cadence
        // window when it built the plan (FillPlanRow.filledAmount). The
        // server only writes if the current sum still matches — the
        // idempotency key for fillWeek (7492dbc).
        expectedFilledAmount: z
          .number()
          .min(0, "Montant invalide")
          .max(MAX_MONEY, "Montant trop élevé")
          .default(0),
      })
    )
    .min(1, "Aucune enveloppe à remplir")
    .max(MAX_FILLS_PER_WEEK, "Trop d'enveloppes à remplir")
    .refine((fills) => new Set(fills.map((f) => f.envelopeId)).size === fills.length, {
      message: "Une enveloppe apparaît deux fois",
    }),
});

export type FillWeekInput = z.input<typeof fillWeekSchema>;

export type FillCadence = "WEEKLY" | "MONTHLY";

export type EnvelopeFormValues = z.infer<typeof envelopeSchema>;
export type GoalEnvelopeFormValues = z.infer<typeof goalEnvelopeSchema>;
export type EnvelopeTransactionFormValues = z.infer<typeof envelopeTransactionSchema>;
export type TransferFormValues = z.infer<typeof transferSchema>;
