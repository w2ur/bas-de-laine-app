"use server";

import { prisma } from "@/lib/prisma";
import { getHousehold } from "@/lib/auth/server";
import { transferSchema } from "@/lib/schemas/envelope";
import { todayInParisDate } from "@/lib/format";
import { runTransferWrite } from "@/lib/envelope-write-transactions";
import { revalidatePath } from "next/cache";

export async function transferBetweenEnvelopes(
  formData: FormData
): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = transferSchema.safeParse(raw);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  if (parsed.sourceId === parsed.destinationId) {
    return { error: "La source et la destination doivent être différentes." };
  }

  // Verify both envelopes belong to the household (outside tx is fine for auth check)
  const [source, destination] = await Promise.all([
    prisma.envelope.findFirst({ where: { id: parsed.sourceId, householdId } }),
    prisma.envelope.findFirst({ where: { id: parsed.destinationId, householdId } }),
  ]);

  if (!source) return { error: "Enveloppe source introuvable" };
  if (!destination) return { error: "Enveloppe destination introuvable" };

  const txDate = parsed.date ?? todayInParisDate();

  // Locks both envelope rows first, in id order (9423421 —
  // see runTransferWrite's doc comment for why the previous "concurrent
  // transfers cannot both pass the check-then-act" comment was false
  // without it), then re-checks the balance/ceiling guards inside the
  // transaction so concurrent transfers cannot both pass them. The
  // destination's type and target come from the lock statement, not from
  // the ownership read above, which runs before the lock.
  const { error } = await prisma.$transaction((tx) =>
    runTransferWrite(tx, {
      sourceId: parsed.sourceId,
      destinationId: parsed.destinationId,
      amount: parsed.amount,
      description: parsed.description || null,
      date: txDate,
    })
  );

  if (error) return { error };

  revalidatePath("/enveloppes", "layout");
  return {};
}
