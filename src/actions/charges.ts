"use server";

import { prisma } from "@/lib/prisma";
import { getHousehold } from "@/lib/auth/server";
import { chargeSchema } from "@/lib/schemas/charge";
import { revalidatePath } from "next/cache";

export async function createCharge(formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = chargeSchema.safeParse({
    ...raw,
    active: raw.active === "true" || raw.active === "on",
  });
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  await prisma.recurringCharge.create({
    data: {
      householdId,
      ...parsed,
    },
  });

  revalidatePath("/configuration");
  revalidatePath("/configuration/charges-fixes");
  revalidatePath("/enveloppes");
  return {};
}

export async function updateCharge(id: string, formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = chargeSchema.safeParse({
    ...raw,
    active: raw.active === "true" || raw.active === "on",
  });
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  try {
    await prisma.recurringCharge.update({
      where: { id, householdId },
      data: parsed,
    });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2025"
    ) {
      return { error: "Charge introuvable" };
    }
    throw e;
  }

  revalidatePath("/configuration");
  revalidatePath("/configuration/charges-fixes");
  revalidatePath("/enveloppes");
  return {};
}

export async function deleteCharge(id: string): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();

  try {
    await prisma.recurringCharge.delete({
      where: { id, householdId },
    });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2025"
    ) {
      return { error: "Charge introuvable" };
    }
    throw e;
  }

  revalidatePath("/configuration");
  revalidatePath("/configuration/charges-fixes");
  revalidatePath("/enveloppes");
  return {};
}

export async function toggleCharge(id: string, active: boolean): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();

  try {
    await prisma.recurringCharge.update({
      where: { id, householdId },
      data: { active },
    });
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2025"
    ) {
      return { error: "Charge introuvable" };
    }
    throw e;
  }

  revalidatePath("/configuration");
  revalidatePath("/configuration/charges-fixes");
  revalidatePath("/enveloppes");
  return {};
}
