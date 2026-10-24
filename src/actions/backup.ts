"use server";

import { prisma } from "@/lib/prisma";
import { getHousehold } from "@/lib/auth/server";
import { backupSchema } from "@/lib/schemas/backup";
import {
  collectTransferLinks,
  validatePayloadIntegrity,
} from "@/lib/backup-helpers";
import { revalidatePath } from "next/cache";

export async function exportHouseholdData() {
  const { householdId, household } = await getHousehold();

  const [envelopes, recurringCharges, treasury] = await Promise.all([
    prisma.envelope.findMany({
      where: { householdId },
      include: { transactions: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.recurringCharge.findMany({
      where: { householdId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.treasury.findUnique({
      where: { householdId },
      include: { adjustments: true, pools: { orderBy: { order: "asc" } } },
    }),
  ]);

  return {
    meta: {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: "budgetor",
    },
    household: {
      income: Number(household.income),
    },
    envelopes: envelopes.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      // Preserve null for GOAL envelopes — do not coerce to 0.
      monthlyBudget: e.monthlyBudget !== null ? Number(e.monthlyBudget) : null,
      fillCadence: e.fillCadence,
      targetAmount: e.targetAmount !== null ? Number(e.targetAmount) : null,
      targetDate: e.targetDate ? e.targetDate.toISOString().split("T")[0] : null,
      icon: e.icon,
      color: e.color,
      sortOrder: e.sortOrder,
      isArchived: e.isArchived,
      createdAt: e.createdAt.toISOString(),
      transactions: e.transactions.map((t) => ({
        id: t.id,
        date: t.date.toISOString().split("T")[0],
        amount: Number(t.amount),
        type: t.type as "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT",
        description: t.description,
        linkedTransactionId: t.linkedTransactionId ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    })),
    recurringCharges: recurringCharges.map((rc) => ({
      id: rc.id,
      name: rc.name,
      amount: Number(rc.amount),
      dayOfMonth: rc.dayOfMonth,
      active: rc.active,
      createdAt: rc.createdAt.toISOString(),
    })),
    treasury: treasury
      ? {
          id: treasury.id,
          balance: Number(treasury.balance),
          createdAt: treasury.createdAt.toISOString(),
          adjustments: treasury.adjustments.map((a) => ({
            id: a.id,
            amount: Number(a.amount),
            type: a.type,
            label: a.label,
            createdAt: a.createdAt.toISOString(),
          })),
          pools: treasury.pools.map((p) => ({
            id: p.id,
            name: p.name,
            availability: p.availability,
            amount: Number(p.amount),
            order: p.order,
            createdAt: p.createdAt.toISOString(),
          })),
        }
      : null,
  };
}

// ─── Import action ─────────────────────────────────────────────────────────────

export async function importHouseholdData(raw: unknown): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();

  const parseResult = backupSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: "Le fichier de sauvegarde est invalide ou corrompu" };
  }
  const data = parseResult.data;

  // Validate referential integrity before any write
  const integrityError = validatePayloadIntegrity(data);
  if (integrityError) {
    return { error: integrityError };
  }

  // Collect transfer links for the two-pass restore
  const transferLinks = collectTransferLinks(data);

  try {
    await prisma.$transaction(
      async (tx) => {
        // Delete all household data (children first)
        await tx.treasuryPool.deleteMany({ where: { treasury: { householdId } } });
        await tx.treasuryAdjustment.deleteMany({ where: { treasury: { householdId } } });
        await tx.treasury.deleteMany({ where: { householdId } });
        await tx.envelopeTransaction.deleteMany({ where: { envelope: { householdId } } });
        await tx.envelope.deleteMany({ where: { householdId } });
        await tx.recurringCharge.deleteMany({ where: { householdId } });

        // Update household income
        await tx.household.update({
          where: { id: householdId },
          data: { income: data.household.income },
        });

        // Pass 1: insert envelopes and their transactions with linkedTransactionId: null
        // to avoid FK violations on circular transfer pairs.
        for (const env of data.envelopes) {
          await tx.envelope.create({
            data: {
              id: env.id,
              householdId,
              name: env.name,
              type: env.type ?? "BUDGET",
              monthlyBudget: env.monthlyBudget ?? null,
              fillCadence: env.fillCadence,
              targetAmount: env.targetAmount ?? null,
              targetDate: env.targetDate ? new Date(env.targetDate) : null,
              icon: env.icon,
              color: env.color,
              sortOrder: env.sortOrder,
              isArchived: env.isArchived,
              createdAt: new Date(env.createdAt),
            },
          });
          if (env.transactions.length > 0) {
            await tx.envelopeTransaction.createMany({
              data: env.transactions.map((t) => ({
                id: t.id,
                envelopeId: env.id,
                date: new Date(t.date),
                amount: t.amount,
                type: t.type,
                description: t.description,
                // Defer FK links to pass 2 to avoid non-deferrable FK violations
                linkedTransactionId: null,
                createdAt: new Date(t.createdAt),
              })),
            });
          }
        }

        // Pass 2: re-link transfer pairs now that all rows exist
        for (const link of transferLinks) {
          await tx.envelopeTransaction.update({
            where: { id: link.id },
            data: { linkedTransactionId: link.linkedTransactionId },
          });
        }

        // Insert recurring charges
        if (data.recurringCharges.length > 0) {
          await tx.recurringCharge.createMany({
            data: data.recurringCharges.map((rc) => ({
              id: rc.id,
              householdId,
              name: rc.name,
              amount: rc.amount,
              dayOfMonth: rc.dayOfMonth,
              active: rc.active,
              createdAt: new Date(rc.createdAt),
            })),
          });
        }

        // Insert treasury + adjustments
        if (data.treasury) {
          await tx.treasury.create({
            data: {
              id: data.treasury.id,
              householdId,
              balance: data.treasury.balance,
              createdAt: new Date(data.treasury.createdAt),
            },
          });
          if (data.treasury.adjustments.length > 0) {
            await tx.treasuryAdjustment.createMany({
              data: data.treasury.adjustments.map((a) => ({
                id: a.id,
                treasuryId: data.treasury!.id,
                amount: a.amount,
                type: a.type,
                label: a.label,
                createdAt: new Date(a.createdAt),
              })),
            });
          }
          if (data.treasury.pools && data.treasury.pools.length > 0) {
            await tx.treasuryPool.createMany({
              data: data.treasury.pools.map((p) => ({
                id: p.id,
                treasuryId: data.treasury!.id,
                name: p.name,
                availability: p.availability,
                amount: p.amount,
                order: p.order,
                createdAt: new Date(p.createdAt),
              })),
            });
          }
        }
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      // Duplicate ids within the payload are rejected upfront by
      // validatePayloadIntegrity; this only fires when the payload's ids
      // collide with another household's existing data (global unique
      // constraint on the primary key).
      return { error: "Identifiants en conflit avec des données existantes" };
    }
    throw e;
  }

  revalidatePath("/", "layout");
  return {};
}
