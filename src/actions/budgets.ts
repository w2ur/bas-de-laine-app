"use server";

import { prisma } from "@/lib/prisma";
import { getHousehold } from "@/lib/auth/server";
import { incomeSchema } from "@/lib/schemas/budget";
import { envelopeSchema } from "@/lib/schemas/envelope";
import { runArchiveWrite } from "@/lib/envelope-write-transactions";
import { revalidatePath } from "next/cache";

export async function updateIncome(formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const parseResult = incomeSchema.safeParse(Object.fromEntries(formData));
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }

  await prisma.household.update({
    where: { id: householdId },
    data: { income: parseResult.data.income },
  });

  revalidatePath("/configuration");
  revalidatePath("/enveloppes");
  return {};
}

export async function createEnvelope(formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = envelopeSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  const maxOrder = await prisma.envelope.findFirst({
    where: { householdId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  try {
    await prisma.envelope.create({
      data: {
        householdId,
        name: parsed.name,
        monthlyBudget: parsed.monthlyBudget,
        fillCadence: parsed.fillCadence,
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
      return { error: "Une enveloppe porte déjà ce nom." };
    }
    throw e;
  }

  revalidatePath("/configuration");
  revalidatePath("/enveloppes");
  return {};
}

export async function updateEnvelope(id: string, formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = envelopeSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  try {
    await prisma.envelope.update({
      where: { id, householdId },
      data: {
        name: parsed.name,
        monthlyBudget: parsed.monthlyBudget,
        fillCadence: parsed.fillCadence,
        icon: parsed.icon || null,
        color: parsed.color || null,
      },
    });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { error: "Une enveloppe porte déjà ce nom." };
    }
    throw e;
  }

  revalidatePath("/configuration");
  revalidatePath("/enveloppes");
  return {};
}

export async function archiveEnvelope(id: string): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();

  // Locks the row before a GOAL's zero-balance check and archives in the
  // same transaction, so a racing deposit cannot land in between (see
  // runArchiveWrite). A BUDGET envelope is archived whatever its balance.
  const { error } = await prisma.$transaction((tx) =>
    runArchiveWrite(tx, {
      envelopeId: id,
      householdId,
      goalOnly: false,
      errors: { notFound: "Enveloppe introuvable", nonZeroBalance: "Transférez le solde avant d'archiver." },
    })
  );
  if (error) return { error };

  revalidatePath("/configuration");
  revalidatePath("/enveloppes");
  return {};
}
