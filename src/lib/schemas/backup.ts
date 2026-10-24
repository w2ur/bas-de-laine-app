import { z } from "zod";
import { amountGreaterThan } from "@/lib/money";

// ─── Shared constraints ───────────────────────────────────────────────────────

const MAX_MONEY = 9_999_999_999.99;

/** Amount that must be strictly positive (e.g. charges, deposits, transactions). */
const positiveMoney = z
  .number()
  .positive("Le montant doit être positif")
  .max(MAX_MONEY, "Montant trop élevé");

/** Amount that may be zero (e.g. budgets, treasury pools). */
const nonNegativeMoney = z
  .number()
  .min(0, "Le montant ne peut pas être négatif")
  .max(MAX_MONEY, "Montant trop élevé");

/**
 * Amount that may be negative: the treasury balance, which
 * deductFromTreasury decrements with no floor. Bounded by the
 * Decimal(12,2) column on both sides; z.number() rejects non-finite values.
 */
const signedMoney = z
  .number()
  .min(-MAX_MONEY, "Montant trop faible")
  .max(MAX_MONEY, "Montant trop élevé");

/** YYYY-MM-DD date string (export side emits exactly this format). */
const calendarDateString = z.iso
  .date()
  .describe("Date invalide (format attendu : AAAA-MM-JJ)");

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const metaSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  app: z.literal("budgetor"),
});

const envelopeTransactionBackupSchema = z.object({
  id: z.string().min(1),
  date: calendarDateString,
  amount: positiveMoney,
  type: z.enum(["FILL", "SPEND", "TRANSFER_IN", "TRANSFER_OUT"]),
  description: z.string().nullable(),
  linkedTransactionId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

const envelopeBackupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["BUDGET", "GOAL"]).default("BUDGET"),
  /**
   * NULL is valid for GOAL envelopes (no monthly budget allocation).
   * The export preserves null; .default(0) only fires for missing/undefined
   * fields in older backup files produced before null was supported.
   */
  monthlyBudget: z.number().min(0).max(MAX_MONEY).nullable().default(0),
  /** Added in round 5; older backups omit it — WEEKLY matches the DB default. */
  fillCadence: z.enum(["WEEKLY", "MONTHLY"]).default("WEEKLY"),
  targetAmount: nonNegativeMoney.nullable().optional(),
  targetDate: calendarDateString.nullable().optional(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  isArchived: z.boolean(),
  createdAt: z.string().datetime(),
  transactions: z.array(envelopeTransactionBackupSchema).max(
    20_000,
    "Trop de transactions dans cette enveloppe (maximum 20 000)"
  ),
});

const recurringChargeBackupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amount: positiveMoney,
  dayOfMonth: z.number().int().min(1).max(31),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

/**
 * The amount follows what the live writer of each type accepts: a SET
 * (`treasurySetSchema.balance`) and a REFRESH (the pools' sum) may be 0,
 * while a DEDUCT (`treasuryDeductSchema.amount`) must be strictly positive
 * and, like the live writer, must not round to 0,00 €.
 */
const treasuryAdjustmentBackupSchema = z
  .object({
    id: z.string().min(1),
    amount: nonNegativeMoney,
    type: z.enum(["SET", "DEDUCT", "REFRESH"]),
    label: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .superRefine((adjustment, ctx) => {
    if (adjustment.type === "DEDUCT" && !amountGreaterThan(adjustment.amount, 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Le montant doit être positif",
      });
    }
  });

const treasuryPoolBackupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  availability: z.enum(["IMMEDIATE", "SHORT", "LONG"]),
  amount: nonNegativeMoney,
  order: z.number().int(),
  createdAt: z.string().datetime(),
});

const treasuryBackupSchema = z.object({
  id: z.string().min(1),
  balance: signedMoney,
  createdAt: z.string().datetime(),
  adjustments: z
    .array(treasuryAdjustmentBackupSchema)
    .max(10_000, "Trop d'ajustements de trésorerie (maximum 10 000)"),
  pools: z
    .array(treasuryPoolBackupSchema)
    .max(200, "Trop de comptes de trésorerie (maximum 200)")
    .default([]),
});

/**
 * The backup object has no `.strict()` mode, so legacy keys from a
 * pre-removal export (`savingsAccount`, `autoSaveLogs`, `notifications`) are
 * silently stripped by Zod's default "unknown keys" behavior instead of
 * failing validation — a backup taken before the savings ledger was removed
 * must still restore. This is unchanged from prior behaviour (the schema
 * never had `.strict()`).
 */
export const backupSchema = z.object({
  meta: metaSchema,
  household: z.object({
    income: nonNegativeMoney,
  }),
  envelopes: z
    .array(envelopeBackupSchema)
    .max(200, "Trop d'enveloppes (maximum 200)"),
  recurringCharges: z
    .array(recurringChargeBackupSchema)
    .max(500, "Trop de charges récurrentes (maximum 500)"),
  treasury: treasuryBackupSchema.nullable(),
});

export type BackupData = z.infer<typeof backupSchema>;
