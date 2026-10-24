"use server";

import { prisma } from "@/lib/prisma";
import { getHousehold } from "@/lib/auth/server";
import {
  treasurySetSchema,
  treasuryDeductSchema,
  treasuryPoolCreateSchema,
  treasuryPoolUpdateSchema,
} from "@/lib/schemas/treasury";
import { revalidatePath } from "next/cache";

export async function setTreasuryBalance(
  formData: FormData
): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = treasurySetSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  const treasury = await prisma.treasury.findUnique({ where: { householdId } });
  if (!treasury) return { error: "Trésorerie introuvable" };

  await prisma.$transaction([
    prisma.treasury.update({
      where: { householdId },
      data: { balance: parsed.balance },
    }),
    prisma.treasuryAdjustment.create({
      data: {
        treasuryId: treasury.id,
        amount: parsed.balance,
        type: "SET",
        label: parsed.label || "Mise à jour du solde",
      },
    }),
  ]);

  revalidatePath("/tresorerie", "layout");
  return {};
}

export async function deductFromTreasury(
  formData: FormData
): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = treasuryDeductSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  const treasury = await prisma.treasury.findUnique({ where: { householdId } });
  if (!treasury) return { error: "Trésorerie introuvable" };

  // Atomic decrement — avoids the read-modify-write lost-update race (finding 34)
  await prisma.$transaction([
    prisma.treasury.update({
      where: { householdId },
      data: { balance: { decrement: parsed.amount } },
    }),
    prisma.treasuryAdjustment.create({
      data: {
        treasuryId: treasury.id,
        amount: parsed.amount,
        type: "DEDUCT",
        label: parsed.label,
      },
    }),
  ]);

  revalidatePath("/tresorerie", "layout");
  return {};
}

export async function createTreasuryPool(
  formData: FormData
): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = treasuryPoolCreateSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  const treasury = await prisma.treasury.findUnique({ where: { householdId } });
  if (!treasury) return { error: "Trésorerie introuvable" };

  const maxOrder = await prisma.treasuryPool.aggregate({
    where: { treasuryId: treasury.id },
    _max: { order: true },
  });

  await prisma.treasuryPool.create({
    data: {
      treasuryId: treasury.id,
      name: parsed.name,
      availability: parsed.availability,
      amount: parsed.amount,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  revalidatePath("/tresorerie", "layout");
  return {};
}

export async function updateTreasuryPool(
  formData: FormData
): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = treasuryPoolUpdateSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  const pool = await prisma.treasuryPool.findUnique({
    where: { id: parsed.id },
    include: { treasury: true },
  });
  if (!pool || pool.treasury.householdId !== householdId) {
    return { error: "Compte introuvable" };
  }

  await prisma.treasuryPool.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      availability: parsed.availability,
      amount: parsed.amount,
    },
  });

  revalidatePath("/tresorerie", "layout");
  return {};
}

export async function deleteTreasuryPool(
  poolId: string
): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();

  const pool = await prisma.treasuryPool.findUnique({
    where: { id: poolId },
    include: { treasury: true },
  });
  if (!pool || pool.treasury.householdId !== householdId) {
    return { error: "Compte introuvable" };
  }

  await prisma.treasuryPool.delete({ where: { id: poolId } });

  revalidatePath("/tresorerie", "layout");
  return {};
}

export async function refreshTreasuryTotal(): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();

  const treasury = await prisma.treasury.findUnique({
    where: { householdId },
    include: { pools: true },
  });
  if (!treasury) return { error: "Trésorerie introuvable" };

  const poolsTotal = treasury.pools.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  await prisma.$transaction([
    prisma.treasury.update({
      where: { householdId },
      data: { balance: poolsTotal },
    }),
    prisma.treasuryAdjustment.create({
      data: {
        treasuryId: treasury.id,
        amount: poolsTotal,
        type: "REFRESH",
        label: "Synchronisation avec les comptes",
      },
    }),
  ]);

  revalidatePath("/tresorerie", "layout");
  return {};
}
