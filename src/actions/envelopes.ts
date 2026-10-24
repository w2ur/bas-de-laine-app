"use server";

import { prisma } from "@/lib/prisma";
import { getHousehold } from "@/lib/auth/server";
import { envelopeTransactionSchema, fillWeekSchema, type FillWeekInput } from "@/lib/schemas/envelope";
import { todayInParisDate, getCurrentFinancialMonth, getFinancialMonthBounds } from "@/lib/format";
import { fillWeekDateRejection, findForeignOrInvalidEnvelope, roundFillAmountsOrReject } from "@/lib/fill-week-logic";
import { getFinancialWeek } from "@/lib/week-logic";
import { runDeleteTransactionWrite, runFillWeekWrite, runGoalFillWrite } from "@/lib/envelope-write-transactions";
import { revalidatePath } from "next/cache";

export async function fillEnvelope(formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = envelopeTransactionSchema.safeParse({ ...raw, type: "FILL" });
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  // Verify envelope belongs to household
  const envelope = await prisma.envelope.findFirst({
    where: { id: parsed.envelopeId, householdId },
  });
  if (!envelope) return { error: "Enveloppe introuvable" };
  // An archived envelope is listed nowhere and cannot be unarchived, so money
  // put there vanishes from every view. The GOAL path re-checks under the
  // lock (runGoalFillWrite); a BUDGET envelope is archived whatever its
  // balance, so a fill racing its archive ends as "filled, then archived".
  if (envelope.isArchived) {
    return {
      error:
        envelope.type === "GOAL"
          ? "Cet objectif a été clôturé. Rechargez la page."
          : "Cette enveloppe a été archivée. Rechargez la page.",
    };
  }

  if (envelope.type === "GOAL") {
    // Locks the envelope row first, reading the goal's target and
    // is_archived in the lock statement, then re-reads its transactions to
    // compute the balance and refuses the write if it would overshoot the
    // goal (9ffc535 — see runGoalFillWrite's doc comment for why the
    // previous "Race-free" comment here was false without the lock, and why
    // the target is not taken from the read above). Every GOAL takes this
    // path, a null target included (18f593b): the unlocked insert below
    // does not conflict with runArchiveWrite's lock, so a deposit there
    // could land in a goal being closed. With no target there is no ceiling.
    const { error } = await prisma.$transaction((tx) =>
      runGoalFillWrite(tx, {
        envelopeId: envelope.id,
        amount: parsed.amount,
        description: parsed.description || null,
        date: parsed.date ?? todayInParisDate(),
      })
    );

    if (error) return { error };
  } else {
    await prisma.envelopeTransaction.create({
      data: {
        envelopeId: parsed.envelopeId,
        amount: parsed.amount,
        type: "FILL",
        description: parsed.description || null,
        date: parsed.date ?? todayInParisDate(),
      },
    });
  }

  revalidatePath("/enveloppes", "layout");
  return {};
}

export async function spendFromEnvelope(formData: FormData): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();
  const raw = Object.fromEntries(formData);
  const parseResult = envelopeTransactionSchema.safeParse({ ...raw, type: "SPEND" });
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  const envelope = await prisma.envelope.findFirst({
    where: { id: parsed.envelopeId, householdId },
  });
  if (!envelope) return { error: "Enveloppe introuvable" };
  // Same reason as fillEnvelope: a spend recorded on an archived envelope is
  // shown by no view and counted in no total. No lock: archiving a BUDGET
  // envelope has no balance guard, so a racing spend ends as "spent, then
  // archived", a state a legitimate order also produces.
  if (envelope.isArchived) return { error: "Cette enveloppe a été archivée. Rechargez la page." };

  if (envelope.type === "GOAL") {
    return { error: "Les dépenses se font depuis une enveloppe budget. Transférez d'abord le solde." };
  }

  await prisma.envelopeTransaction.create({
    data: {
      envelopeId: parsed.envelopeId,
      amount: parsed.amount,
      type: "SPEND",
      description: parsed.description || null,
      date: parsed.date ?? todayInParisDate(),
    },
  });

  revalidatePath("/enveloppes", "layout");
  return {};
}

/**
 * Monday ritual: creates one FILL per envelope in a single transaction, all
 * dated the same calendar day (the week's Monday, sourced from getFillPlan's
 * `mondayDate` and re-validated here: not in the future, inside the current
 * financial month, actually a Monday, and — bc23cfb — exactly
 * the server-derived current week's Monday).
 *
 * Idempotency (F1/N1): inside the write transaction, existing FILLs are
 * re-read for each target envelope's own cadence window (the week for
 * WEEKLY, the financial month for MONTHLY) and a fill is written only if
 * the current sum still matches `expectedFilledAmount` (the row's
 * `filledAmount` the client saw) — the guard against two tabs, two
 * household members, or a PWA restored from bfcache all confirming the
 * same Monday, while still letting a genuine top-up through. (7492dbc: the
 * previous boolean "any fill exists" check dropped every top-up, not just a
 * stale resubmission.) The write transaction locks the
 * target envelope rows first (9ffc535 — see runFillWeekWrite's
 * doc comment).
 */
export async function fillWeek(
  input: FillWeekInput
): Promise<{ error?: string; stale?: true; droppedCount?: number }> {
  const { householdId } = await getHousehold();
  const parseResult = fillWeekSchema.safeParse(input);
  if (!parseResult.success) {
    return { error: parseResult.error.issues[0].message };
  }
  const parsed = parseResult.data;

  const currentMonth = getCurrentFinancialMonth();
  const monthBounds = getFinancialMonthBounds(currentMonth);
  const today = todayInParisDate();
  const week = getFinancialWeek(currentMonth, today);
  const dateRejection = fillWeekDateRejection({ date: parsed.date, today, monthBounds, currentMonday: week.monday });
  if (dateRejection) return dateRejection;

  const owned = await prisma.envelope.findMany({
    where: { householdId, id: { in: parsed.fills.map((f) => f.envelopeId) } },
    select: { id: true, type: true, isArchived: true, fillCadence: true },
  });
  if (findForeignOrInvalidEnvelope(parsed.fills, owned) !== null) {
    return { error: "Enveloppe introuvable" };
  }
  const cadenceById = new Map(owned.map((e) => [e.id, e.fillCadence]));

  const roundedOrError = roundFillAmountsOrReject(parsed.fills);
  if ("error" in roundedOrError) return { error: roundedOrError.error };
  const expectedByEnvelope = new Map(parsed.fills.map((f) => [f.envelopeId, f.expectedFilledAmount]));
  const fills = roundedOrError.fills.map((f) => ({
    ...f,
    expectedFilledAmount: expectedByEnvelope.get(f.envelopeId) ?? 0,
  }));

  const { droppedCount } = await prisma.$transaction((tx) =>
    runFillWeekWrite(tx, { fills, cadenceById, week, monthBounds, date: parsed.date })
  );

  revalidatePath("/enveloppes", "layout");
  return droppedCount > 0 ? { droppedCount } : {};
}

export async function deleteEnvelopeTransaction(id: string): Promise<{ error?: string }> {
  const { householdId } = await getHousehold();

  // Locks every envelope the delete touches, refuses an archived one on
  // either leg, then deletes the row or the transfer pair in the same
  // transaction (see runDeleteTransactionWrite).
  try {
    const { error } = await prisma.$transaction((tx) =>
      runDeleteTransactionWrite(tx, { transactionId: id, householdId })
    );
    if (error) return { error };
  } catch (e: unknown) {
    // P2025 = record not found — concurrent double-delete, safe to ignore
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2025"
    ) {
      // Both rows already gone — treat as success
    } else {
      throw e;
    }
  }

  revalidatePath("/enveloppes", "layout");
  return {};
}
