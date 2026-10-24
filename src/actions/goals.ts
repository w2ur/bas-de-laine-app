"use server";

import { prisma } from "@/lib/prisma";
import { getHousehold } from "@/lib/auth/server";
import { goalEnvelopeSchema } from "@/lib/schemas/envelope";
import { runArchiveWrite, runGoalTargetUpdate } from "@/lib/envelope-write-transactions";
import { revalidatePath } from "next/cache";

export async function createGoalEnvelope(formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = goalEnvelopeSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  const maxOrder = await prisma.envelope.findFirst({
    where: { householdId, type: "GOAL" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  try {
    await prisma.envelope.create({
      data: {
        householdId,
        type: "GOAL",
        name: parsed.name,
        targetAmount: parsed.targetAmount,
        targetDate: parsed.targetDate ?? null,
        monthlyBudget: null,
        icon: parsed.icon || null,
        color: parsed.color || null,
        sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
      },
    });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { error: "Ce nom d'enveloppe existe déjà." };
    }
    throw e;
  }

  revalidatePath("/configuration");
  revalidatePath("/enveloppes");
  return {};
}

export async function updateGoalEnvelope(id: string, formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = goalEnvelopeSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  // Locks the goal's row before reading its balance, the same lock the GOAL
  // fill and the transfer take, so a deposit cannot commit between the
  // balance check and the target write (see runGoalTargetUpdate).
  let error: string | null;
  try {
    ({ error } = await prisma.$transaction((tx) =>
      runGoalTargetUpdate(tx, {
        envelopeId: id,
        householdId,
        data: {
          name: parsed.name,
          targetAmount: parsed.targetAmount,
          targetDate: parsed.targetDate ?? null,
          icon: parsed.icon || null,
          color: parsed.color || null,
        },
      })
    ));
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { error: "Ce nom d'enveloppe existe déjà." };
    }
    throw e;
  }
  if (error) return { error };

  revalidatePath("/configuration");
  revalidatePath("/enveloppes");
  return {};
}

export async function closeGoalEnvelope(id: string): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();

  // Locks the goal's row before the zero-balance check (half-cent
  // tolerance, so float dust never blocks a close at 0,00 €) and closes it
  // in the same transaction, so a racing deposit cannot land in between
  // (see runArchiveWrite).
  const { error } = await prisma.$transaction((tx) =>
    runArchiveWrite(tx, {
      envelopeId: id,
      householdId,
      goalOnly: true,
      errors: { notFound: "Objectif introuvable", nonZeroBalance: "Transférez le solde avant de clôturer." },
    })
  );
  if (error) return { error };

  revalidatePath("/configuration");
  revalidatePath("/enveloppes");
  return {};
}
