/**
 * Runs the write step of a money-path transaction, locking the target
 * envelope rows first. Extracted from `src/actions/envelopes.ts` so the lock
 * ordering can be pinned with a mocked `tx`, without importing the real
 * Prisma client (which throws at import time when DATABASE_URL is unset —
 * the reason there is no test file for the actions themselves).
 */

import { Prisma, type EnvelopeTransactionType } from "@prisma/client";
import { computeEnvelopeBalance } from "@/lib/envelope-balance";
import { amountGreaterThan, isZeroAmount } from "@/lib/money";
import { formatCurrency } from "@/lib/format";
import { partitionFillsByExpectedState } from "@/lib/fill-week-logic";
import { buildTransferPair } from "@/lib/transfer-logic";

/**
 * What the GOAL fill and the transfer lock statements return: the ceiling
 * inputs are read by the lock itself, so a target changed by a concurrent
 * `runGoalTargetUpdate` (which takes the same lock) is never compared as a
 * stale snapshot. The same holds for `isArchived` and `runArchiveWrite`.
 */
type LockedEnvelopeRow = {
  id: string;
  type: "BUDGET" | "GOAL";
  targetAmount: number | { toString(): string } | null;
  isArchived: boolean;
};

/**
 * Minimal transaction-client shape `runFillWeekWrite` needs — narrow enough
 * to mock in a test without implementing all of `Prisma.TransactionClient`.
 */
export interface FillWeekTx {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  envelopeTransaction: {
    findMany(args: {
      where: { envelopeId: { in: string[] }; type: "FILL"; date: { gte: Date; lte: Date } };
      select: { envelopeId: true; date: true; amount: true };
    }): Promise<{ envelopeId: string; date: Date; amount: number | { toString(): string } }[]>;
    createMany(args: {
      data: { envelopeId: string; amount: number; type: "FILL"; description: string; date: Date }[];
    }): Promise<unknown>;
  };
}

export interface FillWeekWriteInput {
  fills: { envelopeId: string; amount: number; expectedFilledAmount: number }[];
  cadenceById: Map<string, "WEEKLY" | "MONTHLY">;
  week: { monday: Date; sunday: Date };
  monthBounds: { start: Date; end: Date };
  date: Date;
}

/**
 * Locks the target envelope rows, re-reads existing FILLs, partitions by
 * expected state (N1), and writes only what should still be inserted.
 *
 * Regression: 9ffc535 (Minor, residual of F1). Prisma 7 with
 * `@prisma/adapter-pg` over TCP runs interactive transactions at Postgres's
 * default READ COMMITTED (`src/lib/prisma.ts` sets no `isolationLevel`), so
 * two overlapping `fillWeek` transactions could each run `findMany` before
 * either committed and both `createMany` — the previous claim that "a fill
 * created by a concurrent request is seen" was false without a lock.
 * `SELECT ... FOR NO KEY UPDATE` is the first statement: it blocks a second
 * transaction on these same envelope rows until the first commits, so the
 * second transaction's later `findMany` then sees the first transaction's
 * writes. `ORDER BY id` gives two calls touching an overlapping set of
 * envelopes the same lock acquisition order, avoiding a deadlock. This
 * relies on READ COMMITTED — under REPEATABLE READ the re-read would reuse
 * the transaction's first snapshot and would not see the other
 * transaction's commit even after the lock is released.
 *
 * `FOR NO KEY UPDATE`, not `FOR UPDATE` (2996ae1): inserting
 * into `envelope_transactions` runs Postgres's own FK check on the parent
 * envelope row, `SELECT ... FOR KEY SHARE`. `FOR KEY SHARE` conflicts with
 * `FOR UPDATE` — and only with `FOR UPDATE` — so a `fillWeek` transaction
 * locking with `FOR UPDATE` could deadlock with a concurrent transfer
 * (`transferBetweenEnvelopes`) taking `FOR KEY SHARE` on the same envelope
 * in the opposite order. `FOR NO KEY UPDATE` still conflicts with itself
 * (two `fillWeek` calls, or a `fillWeek` and a GOAL fill, still serialize)
 * but never with `FOR KEY SHARE`, so it does not block or deadlock with the
 * FK check the insert triggers.
 */
export async function runFillWeekWrite(
  tx: FillWeekTx,
  input: FillWeekWriteInput
): Promise<{ droppedCount: number }> {
  const envelopeIds = input.fills.map((f) => f.envelopeId);

  await tx.$queryRaw`SELECT id FROM envelopes WHERE id IN (${Prisma.join(envelopeIds)}) ORDER BY id FOR NO KEY UPDATE`;

  const existing = await tx.envelopeTransaction.findMany({
    where: {
      envelopeId: { in: envelopeIds },
      type: "FILL",
      date: { gte: input.monthBounds.start, lte: input.monthBounds.end },
    },
    select: { envelopeId: true, date: true, amount: true },
  });

  const existingFillsById = new Map<string, { date: Date; amount: number }[]>();
  for (const t of existing) {
    const list = existingFillsById.get(t.envelopeId) ?? [];
    list.push({ date: t.date, amount: Number(t.amount) });
    existingFillsById.set(t.envelopeId, list);
  }

  const { toInsert, droppedCount } = partitionFillsByExpectedState(
    input.fills,
    input.cadenceById,
    existingFillsById,
    input.week,
    input.monthBounds
  );

  if (toInsert.length > 0) {
    await tx.envelopeTransaction.createMany({
      data: toInsert.map((f) => ({
        envelopeId: f.envelopeId,
        amount: f.amount,
        type: "FILL" as const,
        description:
          input.cadenceById.get(f.envelopeId) === "MONTHLY" ? "Remplissage du mois" : "Remplissage de la semaine",
        date: input.date,
      })),
    });
  }

  return { droppedCount };
}

/**
 * Minimal transaction-client shape `runGoalFillWrite` needs.
 */
export interface GoalFillTx {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  envelopeTransaction: {
    findMany(args: {
      where: { envelopeId: string };
    }): Promise<{ amount: number | { toString(): string }; type: EnvelopeTransactionType }[]>;
    create(args: {
      data: { envelopeId: string; amount: number; type: "FILL"; description: string | null; date: Date };
    }): Promise<unknown>;
  };
}

export interface GoalFillWriteInput {
  envelopeId: string;
  amount: number;
  description: string | null;
  date: Date;
}

/**
 * Locks the target envelope row, re-reads its transactions to compute the
 * balance, and refuses the write if it would overshoot the goal's
 * `targetAmount`.
 *
 * Regression: 9ffc535 — noted by the reviewer alongside
 * fillWeek's fix (pre-existing, not introduced in the reviewed range). This
 * was commented "Race-free" but ran the same unlocked read-then-insert
 * under READ COMMITTED as `fillWeek` did before this fix: two concurrent
 * deposits could each read the same balance before either committed and
 * both write, overshooting `targetAmount`. Same lock as `runFillWeekWrite`,
 * including `FOR NO KEY UPDATE` rather than `FOR UPDATE` (2996ae1 — see
 * `runFillWeekWrite`'s doc comment for why).
 *
 * Regression: b383d00 — the target used to be passed in, read by
 * `fillEnvelope` before the transaction. A target lowered by a concurrent
 * `updateGoalEnvelope` after that read was never seen, so a deposit could
 * leave the goal above its new target. The lock statement now returns the
 * target, and the guard compares against that value.
 *
 * Regression: b1cc5ca — an archived (closed) goal was never refused, so a
 * deposit from a stale tab, or one racing `closeGoalEnvelope`, landed in a
 * goal that no page lists and no transfer can reach. The lock statement
 * returns `is_archived`, and `runArchiveWrite` takes the same lock.
 */
export async function runGoalFillWrite(
  tx: GoalFillTx,
  input: GoalFillWriteInput
): Promise<{ error: string | null }> {
  const [locked] = (await tx.$queryRaw`SELECT id, "type", target_amount AS "targetAmount", is_archived AS "isArchived" FROM envelopes WHERE id = ${input.envelopeId} FOR NO KEY UPDATE`) as LockedEnvelopeRow[];
  if (!locked) return { error: "Enveloppe introuvable" };
  if (locked.isArchived) return { error: "Cet objectif a été clôturé. Rechargez la page." };

  if (locked.targetAmount !== null) {
    const allTx = await tx.envelopeTransaction.findMany({ where: { envelopeId: input.envelopeId } });
    const balance = computeEnvelopeBalance(allTx);
    const overflow = balance + input.amount - Number(locked.targetAmount);
    if (amountGreaterThan(overflow, 0)) {
      return {
        error: `Ce versement dépasse l'objectif de ${formatCurrency(overflow)}. Modifiez l'objectif si nécessaire.`,
      };
    }
  }

  await tx.envelopeTransaction.create({
    data: {
      envelopeId: input.envelopeId,
      amount: input.amount,
      type: "FILL",
      description: input.description,
      date: input.date,
    },
  });
  return { error: null };
}

/**
 * Minimal transaction-client shape `runTransferWrite` needs.
 */
export interface TransferTx {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  envelopeTransaction: {
    findMany(args: {
      where: { envelopeId: string };
    }): Promise<{ amount: number | { toString(): string }; type: EnvelopeTransactionType }[]>;
    create(args: {
      data: {
        envelopeId: string;
        amount: number;
        type: "TRANSFER_OUT" | "TRANSFER_IN";
        description: string | null;
        date: Date;
        linkedTransactionId?: string;
      };
    }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: { linkedTransactionId: string } }): Promise<unknown>;
  };
}

export interface TransferWriteInput {
  sourceId: string;
  destinationId: string;
  amount: number;
  description: string | null;
  date: Date;
}

/**
 * Locks the source and destination envelope rows (in id order, regardless
 * of which is source and which is destination), re-reads both balances,
 * refuses the write if it would overdraw the source or overshoot a GOAL
 * destination's target, and otherwise writes the linked TRANSFER_OUT /
 * TRANSFER_IN pair.
 *
 * Regression: 9423421 (Minor, pre-existing — included per
 * the controller's ruling since it bears directly on whether N2's GOAL lock
 * actually holds the goal invariant). `transferBetweenEnvelopes`'s comment
 * claimed "concurrent transfers cannot both pass the check-then-act", but
 * the balance and goal-ceiling checks ran against a plain, unlocked
 * `findMany` — the identical defect N2 fixed for `fillWeek` and the GOAL
 * path. A lock only serializes against writers that also take it:
 * `runGoalFillWrite`'s lock on a GOAL envelope did nothing to stop a
 * concurrent transfer into that same envelope from reading a stale balance
 * and overshooting the target, and two concurrent transfers could likewise
 * both pass `Solde insuffisant` and overdraw one source. Locking both rows
 * here, in id order and with `FOR NO KEY UPDATE` (see `runFillWeekWrite`'s
 * doc comment for why not `FOR UPDATE`), closes both directions and — since
 * every multi-envelope writer now locks in id order before inserting —
 * removes the deadlock risk R3-1 described between a transfer and a
 * `fillWeek`/GOAL fill.
 *
 * Regression: b383d00 — the destination's type and target used to be
 * passed in, read by `transferBetweenEnvelopes` before the transaction, so
 * a goal target lowered concurrently was never seen. The lock statement now
 * returns both rows' type and target, and the ceiling guard uses those.
 *
 * Regression: b1cc5ca — an archived envelope was never refused on either
 * side, so a stale tab could move money into one (where it vanished from
 * every view) or out of one. The lock statement returns `is_archived` for
 * both rows.
 */
export async function runTransferWrite(
  tx: TransferTx,
  input: TransferWriteInput
): Promise<{ error: string | null }> {
  const lockIds = [input.sourceId, input.destinationId].sort();
  const locked = (await tx.$queryRaw`SELECT id, "type", target_amount AS "targetAmount", is_archived AS "isArchived" FROM envelopes WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR NO KEY UPDATE`) as LockedEnvelopeRow[];
  const source = locked.find((row) => row.id === input.sourceId);
  if (!source) return { error: "Enveloppe source introuvable" };
  const destination = locked.find((row) => row.id === input.destinationId);
  if (!destination) return { error: "Enveloppe destination introuvable" };
  if (source.isArchived) return { error: "L'enveloppe source a été archivée. Rechargez la page." };
  if (destination.isArchived) {
    return { error: "L'enveloppe destination a été archivée. Rechargez la page." };
  }

  const sourceTxs = await tx.envelopeTransaction.findMany({ where: { envelopeId: input.sourceId } });
  const sourceBalance = computeEnvelopeBalance(sourceTxs);
  if (amountGreaterThan(input.amount, sourceBalance)) {
    return { error: "Solde insuffisant pour ce transfert." };
  }

  if (destination.type === "GOAL" && destination.targetAmount !== null) {
    const destTxs = await tx.envelopeTransaction.findMany({ where: { envelopeId: input.destinationId } });
    const destBalance = computeEnvelopeBalance(destTxs);
    if (amountGreaterThan(destBalance + input.amount, Number(destination.targetAmount))) {
      return { error: "Ce transfert dépasse l'objectif de l'enveloppe destination." };
    }
  }

  const pair = buildTransferPair({
    sourceId: input.sourceId,
    destinationId: input.destinationId,
    amount: input.amount,
    description: input.description,
    date: input.date,
  });

  const txOut = await tx.envelopeTransaction.create({ data: pair.out });
  const txIn = await tx.envelopeTransaction.create({ data: { ...pair.in, linkedTransactionId: txOut.id } });
  await tx.envelopeTransaction.update({ where: { id: txOut.id }, data: { linkedTransactionId: txIn.id } });

  return { error: null };
}

/**
 * Minimal transaction-client shape `runGoalTargetUpdate` needs.
 */
export interface GoalTargetUpdateTx {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  envelopeTransaction: {
    findMany(args: {
      where: { envelopeId: string };
    }): Promise<{ amount: number | { toString(): string }; type: EnvelopeTransactionType }[]>;
  };
  envelope: {
    update(args: {
      where: { id: string; householdId: string };
      data: {
        name: string;
        targetAmount: number;
        targetDate: Date | null;
        icon: string | null;
        color: string | null;
      };
    }): Promise<unknown>;
  };
}

export interface GoalTargetUpdateInput {
  envelopeId: string;
  householdId: string;
  data: {
    name: string;
    targetAmount: number;
    targetDate: Date | null;
    icon: string | null;
    color: string | null;
  };
}

/**
 * Locks the goal's row, re-reads its balance, refuses a target below that
 * balance, and otherwise writes the goal's fields.
 *
 * Regression: b383d00 — `updateGoalEnvelope` read the balance, compared it
 * with the new target and wrote the target without any lock. The GOAL fill
 * and the transfer serialize on this row, but a writer that does not take
 * the lock is not serialized with them: a deposit committing between this
 * read and this write left the goal above its new target. It now takes the
 * same `FOR NO KEY UPDATE` row lock before reading the balance (one row, so
 * no ordering question). The lock also carries the ownership and GOAL-type
 * filter, so a row it does not return is answered as not found.
 */
export async function runGoalTargetUpdate(
  tx: GoalTargetUpdateTx,
  input: GoalTargetUpdateInput
): Promise<{ error: string | null }> {
  const locked = (await tx.$queryRaw`SELECT id FROM envelopes WHERE id = ${input.envelopeId} AND household_id = ${input.householdId} AND "type" = 'GOAL' FOR NO KEY UPDATE`) as { id: string }[];
  if (locked.length === 0) return { error: "Objectif introuvable" };

  const allTx = await tx.envelopeTransaction.findMany({ where: { envelopeId: input.envelopeId } });
  const balance = computeEnvelopeBalance(allTx);
  // Regression: 75746c0 — a raw `<` refused a 3,30 € target over fills of
  // 1,10 € and 2,20 € (3.3000000000000003 as a double).
  if (amountGreaterThan(balance, input.data.targetAmount)) {
    return {
      error: `L'objectif ne peut pas être inférieur au solde actuel (${formatCurrency(balance)}).`,
    };
  }

  await tx.envelope.update({
    where: { id: input.envelopeId, householdId: input.householdId },
    data: input.data,
  });
  return { error: null };
}

/**
 * Minimal transaction-client shape `runArchiveWrite` needs.
 */
export interface ArchiveTx {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  envelopeTransaction: {
    findMany(args: {
      where: { envelopeId: string };
    }): Promise<{ amount: number | { toString(): string }; type: EnvelopeTransactionType }[]>;
  };
  envelope: {
    update(args: { where: { id: string; householdId: string }; data: { isArchived: true } }): Promise<unknown>;
  };
}

export interface ArchiveWriteInput {
  envelopeId: string;
  householdId: string;
  /** `closeGoalEnvelope`: a BUDGET envelope is answered as not found. */
  goalOnly: boolean;
  errors: { notFound: string; nonZeroBalance: string };
}

/**
 * Locks the envelope row, and for a GOAL re-reads its balance and refuses
 * to archive unless it is zero, then archives it. A BUDGET envelope is
 * archived whatever its balance, by design, so its balance is not read.
 *
 * Regression: b1cc5ca — `closeGoalEnvelope` and `archiveEnvelope` read the
 * balance, checked it was zero and archived with no lock, so a deposit or
 * transfer committing between the check and the UPDATE was left in an
 * archived goal that no page lists. This takes the `FOR NO KEY UPDATE` row
 * lock the GOAL fill and the transfer take (one row, so no ordering
 * question), and they refuse a row it has archived. The lock carries the
 * ownership filter, so a row it does not return is answered as not found.
 */
export async function runArchiveWrite(
  tx: ArchiveTx,
  input: ArchiveWriteInput
): Promise<{ error: string | null }> {
  const [locked] = (await tx.$queryRaw`SELECT id, "type" FROM envelopes WHERE id = ${input.envelopeId} AND household_id = ${input.householdId} FOR NO KEY UPDATE`) as Pick<LockedEnvelopeRow, "id" | "type">[];
  if (!locked || (input.goalOnly && locked.type !== "GOAL")) return { error: input.errors.notFound };

  if (locked.type === "GOAL") {
    const allTx = await tx.envelopeTransaction.findMany({ where: { envelopeId: input.envelopeId } });
    if (!isZeroAmount(computeEnvelopeBalance(allTx))) return { error: input.errors.nonZeroBalance };
  }

  await tx.envelope.update({
    where: { id: input.envelopeId, householdId: input.householdId },
    data: { isArchived: true },
  });
  return { error: null };
}

type TransactionLegs = { envelopeId: string; linkedTransactionId: string | null };

/**
 * Minimal transaction-client shape `runDeleteTransactionWrite` needs.
 */
export interface DeleteTransactionTx {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  envelopeTransaction: {
    findUnique(args: {
      where: { id: string };
      select: { envelopeId: true; linkedTransactionId: true };
    }): Promise<TransactionLegs | null>;
    update(args: { where: { id: string }; data: { linkedTransactionId: null } }): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
}

export interface DeleteTransactionWriteInput {
  transactionId: string;
  householdId: string;
}

/**
 * Deletes one envelope transaction, or both legs of a transfer, after
 * locking every envelope the delete changes the balance of.
 *
 * Regression: 9370869 — the delete never read `isArchived`, and the
 * history page lists archived envelopes' rows. Deleting a transfer out of a
 * goal that had since been closed put the money back into the closed goal,
 * where no page shows it and no transfer can reach it; deleting a row of a
 * closed goal or an archived envelope changed a balance nobody sees. An
 * archived envelope's ledger is now frozen: a delete touching one on either
 * leg is refused. The envelope rows are locked (`FOR NO KEY UPDATE`, sorted
 * id order, household filter) before the check, the same shape as
 * `runTransferWrite`, so a close racing the delete serializes with it, and
 * two deletes of opposite legs of one transfer no longer lock the
 * transaction rows in opposite orders. The main row is re-read under the
 * lock: gone means a concurrent delete won, which is success.
 */
export async function runDeleteTransactionWrite(
  tx: DeleteTransactionTx,
  input: DeleteTransactionWriteInput
): Promise<{ error: string | null }> {
  const legs = { envelopeId: true, linkedTransactionId: true } as const;
  const main = await tx.envelopeTransaction.findUnique({ where: { id: input.transactionId }, select: legs });
  if (!main) return { error: "Transaction introuvable" };
  const linked = main.linkedTransactionId
    ? await tx.envelopeTransaction.findUnique({ where: { id: main.linkedTransactionId }, select: legs })
    : null;

  const envelopeIds = [...new Set([main.envelopeId, ...(linked ? [linked.envelopeId] : [])])].sort();
  const locked = (await tx.$queryRaw`SELECT id, is_archived AS "isArchived" FROM envelopes WHERE id IN (${Prisma.join(envelopeIds)}) AND household_id = ${input.householdId} ORDER BY id FOR NO KEY UPDATE`) as Pick<LockedEnvelopeRow, "id" | "isArchived">[];
  if (locked.length !== envelopeIds.length) return { error: "Transaction introuvable" };
  if (locked.some((row) => row.isArchived)) {
    return { error: "Cette opération touche une enveloppe archivée : elle ne peut plus être supprimée." };
  }

  const current = await tx.envelopeTransaction.findUnique({ where: { id: input.transactionId }, select: legs });
  if (!current) return { error: null };

  if (!current.linkedTransactionId) {
    await tx.envelopeTransaction.delete({ where: { id: input.transactionId } });
    return { error: null };
  }
  // A link only ever goes from set to null, so a link that is set now but
  // was not read before the lock means the pre-lock reads raced a write the
  // lock did not cover; ask for a reload rather than delete unlocked.
  if (!linked || current.linkedTransactionId !== main.linkedTransactionId) {
    return { error: "Cette opération a changé entre-temps. Rechargez la page." };
  }
  // Null out both FK references first (circular constraint), then delete both.
  await tx.envelopeTransaction.update({ where: { id: input.transactionId }, data: { linkedTransactionId: null } });
  await tx.envelopeTransaction.update({ where: { id: current.linkedTransactionId }, data: { linkedTransactionId: null } });
  await tx.envelopeTransaction.delete({ where: { id: current.linkedTransactionId } });
  await tx.envelopeTransaction.delete({ where: { id: input.transactionId } });
  return { error: null };
}
