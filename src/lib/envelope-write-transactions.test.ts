import { describe, it, expect } from "vitest";
import {
  runFillWeekWrite,
  runGoalFillWrite,
  runTransferWrite,
  runGoalTargetUpdate,
  runArchiveWrite,
  runDeleteTransactionWrite,
  type ArchiveTx,
  type DeleteTransactionTx,
  type FillWeekTx,
  type GoalFillTx,
  type GoalTargetUpdateTx,
  type TransferTx,
} from "./envelope-write-transactions";
import { formatCurrency, getFinancialMonthBounds } from "./format";

function makeFillWeekTx(existing: { envelopeId: string; date: Date; amount: number }[]) {
  const calls: string[] = [];
  let lockSql = "";
  let lockValues: unknown[] = [];
  const tx: FillWeekTx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push("lock");
      lockSql = strings.join("?");
      lockValues = values;
      return [];
    },
    envelopeTransaction: {
      findMany: async () => {
        calls.push("findMany");
        return existing;
      },
      createMany: async () => {
        calls.push("createMany");
        return { count: 0 };
      },
    },
  };
  return { tx, calls, getLockSql: () => lockSql, getLockValues: () => lockValues };
}

describe("runFillWeekWrite", () => {
  const week = { monday: new Date(2026, 8, 21), sunday: new Date(2026, 8, 27, 23, 59, 59, 999) };
  const monthBounds = getFinancialMonthBounds(new Date(2026, 8, 1));
  const cadenceById = new Map<string, "WEEKLY" | "MONTHLY">([["w", "WEEKLY"]]);

  // Regression: 9ffc535 (Minor, residual of F1). Prisma 7 with
  // @prisma/adapter-pg over TCP runs interactive transactions at Postgres's
  // default READ COMMITTED (src/lib/prisma.ts sets no isolationLevel), so
  // two overlapping fillWeek transactions could each run findMany before
  // either committed and both insert — the previous doc comment's claim
  // that "a fill created by a concurrent request is seen" was false without
  // a lock. A true concurrency test needs two real overlapping DB
  // transactions, which this repo has no harness for (every Prisma-backed
  // test here mocks the client — no fake concurrency claim is made). This
  // instead pins the one thing a mock can verify: the row lock is the first
  // statement, before the re-read — Postgres's own lock manager is what
  // then makes the second transaction's re-read see the first's commit.
  it("issues the row lock before re-reading existing fills, and creates after", async () => {
    const { tx, calls } = makeFillWeekTx([]);
    await runFillWeekWrite(tx, {
      fills: [{ envelopeId: "w", amount: 138.46, expectedFilledAmount: 0 }],
      cadenceById,
      week,
      monthBounds,
      date: new Date(2026, 8, 21),
    });
    expect(calls).toEqual(["lock", "findMany", "createMany"]);
  });

  it("does not call createMany when every fill is dropped as stale", async () => {
    const { tx, calls } = makeFillWeekTx([{ envelopeId: "w", date: new Date(2026, 8, 22), amount: 138.46 }]);
    const result = await runFillWeekWrite(tx, {
      fills: [{ envelopeId: "w", amount: 138.46, expectedFilledAmount: 0 }],
      cadenceById,
      week,
      monthBounds,
      date: new Date(2026, 8, 21),
    });
    expect(result).toEqual({ droppedCount: 1 });
    expect(calls).toEqual(["lock", "findMany"]);
  });

  // Regression: 2996ae1 — `FOR UPDATE` conflicts with the
  // FK check's `FOR KEY SHARE` on the parent envelope row (Postgres inserts
  // into envelope_transactions), and only `FOR UPDATE` does. A fillWeek
  // transaction locking with `FOR UPDATE` could deadlock with a concurrent
  // BUDGET→BUDGET transfer taking `FOR KEY SHARE` in the opposite id order.
  // `FOR NO KEY UPDATE` still conflicts with itself (so two fillWeek calls
  // still serialize) but never with `FOR KEY SHARE`. The previous test's
  // mock ignored the SQL text entirely, so a regression that dropped
  // `FOR UPDATE`/`ORDER BY` would have stayed green — this asserts the
  // actual lock mode, the ordering clause, and the bound ids, and is issued
  // before the re-read.
  it("locks with FOR NO KEY UPDATE, ordered by id, on the exact fill ids, before the re-read", async () => {
    const { tx, calls, getLockSql, getLockValues } = makeFillWeekTx([]);
    await runFillWeekWrite(tx, {
      fills: [
        { envelopeId: "w", amount: 138.46, expectedFilledAmount: 0 },
        { envelopeId: "m", amount: 553.84, expectedFilledAmount: 0 },
      ],
      cadenceById,
      week,
      monthBounds,
      date: new Date(2026, 8, 21),
    });
    expect(calls.indexOf("lock")).toBe(0);
    expect(calls.indexOf("findMany")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("lock")).toBeLessThan(calls.indexOf("findMany"));
    const sql = getLockSql();
    expect(sql).toContain("FOR NO KEY UPDATE");
    expect(sql).not.toMatch(/\bFOR UPDATE\b/);
    expect(sql).toContain("ORDER BY id");
    const [joined] = getLockValues() as [{ values: string[] }];
    expect(joined.values).toEqual(["w", "m"]);
  });
});

function makeGoalFillTx(
  existing: { amount: number; type: "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT" }[],
  lockedTarget: number | null = 1000,
  lockedArchived = false
) {
  const calls: string[] = [];
  let lockSql = "";
  let lockValues: unknown[] = [];
  const tx: GoalFillTx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push("lock");
      lockSql = strings.join("?");
      lockValues = values;
      return [{ id: "g", type: "GOAL", targetAmount: lockedTarget, isArchived: lockedArchived }];
    },
    envelopeTransaction: {
      findMany: async () => {
        calls.push("findMany");
        return existing;
      },
      create: async () => {
        calls.push("create");
        return {};
      },
    },
  };
  return { tx, calls, getLockSql: () => lockSql, getLockValues: () => lockValues };
}

describe("runGoalFillWrite", () => {
  // Regression: 9ffc535 — noted alongside fillWeek's fix
  // (pre-existing, not introduced in the reviewed range, per the review).
  // fillEnvelope's GOAL path was commented "Race-free" but ran the same
  // unlocked read-then-insert under READ COMMITTED: two concurrent deposits
  // could each read the same balance before either committed and both
  // write, overshooting targetAmount. Same lock, same test shape as above.
  it("issues the row lock before re-reading transactions, and creates after", async () => {
    const { tx, calls } = makeGoalFillTx([]);
    const result = await runGoalFillWrite(tx, {
      envelopeId: "g",
      amount: 50,
      description: null,
      date: new Date(2026, 8, 21),
    });
    expect(result).toEqual({ error: null });
    expect(calls).toEqual(["lock", "findMany", "create"]);
  });

  // Regression: 2996ae1 — same defect and same fix as
  // runFillWeekWrite's lock: FOR UPDATE conflicts with FOR KEY SHARE.
  it("locks with FOR NO KEY UPDATE on the exact envelope id, before the re-read", async () => {
    const { tx, calls, getLockSql, getLockValues } = makeGoalFillTx([]);
    await runGoalFillWrite(tx, {
      envelopeId: "g",
      amount: 50,
      description: null,
      date: new Date(2026, 8, 21),
    });
    expect(calls.indexOf("lock")).toBe(0);
    expect(calls.indexOf("findMany")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("lock")).toBeLessThan(calls.indexOf("findMany"));
    const sql = getLockSql();
    expect(sql).toContain("FOR NO KEY UPDATE");
    expect(sql).not.toMatch(/\bFOR UPDATE\b/);
    expect(getLockValues()).toEqual(["g"]);
  });

  it("does not call create when the deposit would overshoot the target", async () => {
    const calls: string[] = [];
    const tx: GoalFillTx = {
      $queryRaw: async () => {
        calls.push("lock");
        return [{ id: "g", targetAmount: 1000 }];
      },
      envelopeTransaction: {
        findMany: async () => {
          calls.push("findMany");
          return [{ amount: 950, type: "FILL" }];
        },
        create: async () => {
          calls.push("create");
          return {};
        },
      },
    };
    const result = await runGoalFillWrite(tx, {
      envelopeId: "g",
      amount: 100,
      description: null,
      date: new Date(2026, 8, 21),
    });
    expect(result.error).toContain("dépasse l'objectif");
    expect(calls).toEqual(["lock", "findMany"]);
  });

  // Regression: b383d00 — fillEnvelope read the goal's targetAmount before
  // the transaction and passed it in, so a target lowered by a concurrent
  // updateGoalEnvelope after that read was never seen: a 100 € deposit on
  // a 900 € balance passed against the stale 1 000 € target and left the
  // goal above its new 950 € target. The target is now read by the lock
  // statement itself, and the guard runs against that value.
  it("guards against the target returned by the lock, not a value read before it", async () => {
    const { tx, calls, getLockSql } = makeGoalFillTx([{ amount: 900, type: "FILL" }], 950);
    const result = await runGoalFillWrite(tx, {
      envelopeId: "g",
      amount: 100,
      description: null,
      date: new Date(2026, 8, 21),
    });
    expect(getLockSql()).toContain("target_amount");
    expect(result.error).toContain("dépasse l'objectif de 50,00\u00A0€");
    expect(calls).toEqual(["lock", "findMany"]);
  });

  // Regression: b1cc5ca — runGoalFillWrite never read is_archived, so a
  // deposit from a stale tab into a goal closed on another device was
  // written, and the money sat in a goal that no page lists and no
  // transfer can reach. The lock statement now returns is_archived and an
  // archived goal is refused.
  it("refuses a deposit into a goal the lock reports as archived", async () => {
    const { tx, calls, getLockSql } = makeGoalFillTx([], 1000, true);
    const result = await runGoalFillWrite(tx, {
      envelopeId: "g",
      amount: 200,
      description: null,
      date: new Date(2026, 8, 21),
    });
    expect(getLockSql()).toContain("is_archived");
    expect(result.error).toBe("Cet objectif a été clôturé. Rechargez la page.");
    expect(calls).toEqual(["lock"]);
  });

  it("does not write when the envelope is gone by the time the lock is taken", async () => {
    const calls: string[] = [];
    const tx: GoalFillTx = {
      $queryRaw: async () => {
        calls.push("lock");
        return [];
      },
      envelopeTransaction: {
        findMany: async () => {
          calls.push("findMany");
          return [];
        },
        create: async () => {
          calls.push("create");
          return {};
        },
      },
    };
    const result = await runGoalFillWrite(tx, {
      envelopeId: "g",
      amount: 10,
      description: null,
      date: new Date(2026, 8, 21),
    });
    expect(result.error).toBe("Enveloppe introuvable");
    expect(calls).toEqual(["lock"]);
  });
});

type LockedRow = { id: string; type: "BUDGET" | "GOAL"; targetAmount: number | null; isArchived?: boolean };

function makeTransferTx(
  balancesByEnvelope: Record<string, { amount: number; type: "FILL" }[]>,
  lockedRows: Record<string, Omit<LockedRow, "id">> = {}
) {
  const calls: string[] = [];
  let lockSql = "";
  let lockValues: unknown[] = [];
  const tx: TransferTx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push("lock");
      lockSql = strings.join("?");
      lockValues = values;
      const [joined] = values as [{ values: string[] }];
      return joined.values.map(
        (id): LockedRow => ({ id, ...(lockedRows[id] ?? { type: "BUDGET", targetAmount: null }) })
      );
    },
    envelopeTransaction: {
      findMany: async (args) => {
        calls.push("findMany");
        return balancesByEnvelope[args.where.envelopeId] ?? [];
      },
      create: async () => {
        calls.push("create");
        return { id: `created-${calls.filter((c) => c === "create").length}` };
      },
      update: async () => {
        calls.push("update");
        return {};
      },
    },
  };
  return { tx, calls, getLockSql: () => lockSql, getLockValues: () => lockValues };
}

describe("runTransferWrite", () => {
  const base = {
    sourceId: "s",
    destinationId: "d",
    amount: 50,
    description: null,
    date: new Date(2026, 8, 21),
  };

  // Regression: 9423421 (pre-existing, included per the
  // controller's ruling). transferBetweenEnvelopes's comment said
  // "concurrent transfers cannot both pass the check-then-act", but the
  // balance/ceiling checks ran against a plain, unlocked findMany — the same
  // defect N2 fixed for fillWeek and the GOAL path. A lock only serializes
  // against writers that also take it, so runGoalFillWrite's lock alone
  // does not stop a concurrent transfer from overshooting a goal, or two
  // concurrent transfers from overdrawing the same source.
  it("locks source and target with FOR NO KEY UPDATE, in id order, before the balance check", async () => {
    const { tx, calls, getLockSql, getLockValues } = makeTransferTx({ s: [{ amount: 100, type: "FILL" }] });
    const result = await runTransferWrite(tx, base);
    expect(result).toEqual({ error: null });
    expect(calls[0]).toBe("lock");
    expect(calls.indexOf("findMany")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("lock")).toBeLessThan(calls.indexOf("findMany"));
    const sql = getLockSql();
    expect(sql).toContain("FOR NO KEY UPDATE");
    expect(sql).not.toMatch(/\bFOR UPDATE\b/);
    expect(sql).toContain("ORDER BY id");
    const [joined] = getLockValues() as [{ values: string[] }];
    // Locked in id order regardless of which side is source vs destination.
    expect(joined.values).toEqual(["d", "s"]);
  });

  it("locks in id order even when destination sorts before source", async () => {
    const { getLockValues, tx } = makeTransferTx({ b: [{ amount: 100, type: "FILL" }] });
    await runTransferWrite(tx, { ...base, sourceId: "z", destinationId: "b" });
    const [joined] = getLockValues() as [{ values: string[] }];
    expect(joined.values).toEqual(["b", "z"]);
  });

  it("does not write when the source balance is insufficient", async () => {
    const { tx, calls } = makeTransferTx({ s: [] });
    const result = await runTransferWrite(tx, { ...base, amount: 50 });
    expect(result.error).toBe("Solde insuffisant pour ce transfert.");
    expect(calls).toEqual(["lock", "findMany"]);
  });

  it("does not write when a transfer into a GOAL would overshoot its target", async () => {
    const { tx, calls } = makeTransferTx(
      {
        s: [{ amount: 100, type: "FILL" }],
        d: [{ amount: 950, type: "FILL" }],
      },
      { d: { type: "GOAL", targetAmount: 1000 } }
    );
    const result = await runTransferWrite(tx, { ...base, amount: 100 });
    expect(result.error).toContain("dépasse l'objectif");
    expect(calls).toEqual(["lock", "findMany", "findMany"]);
  });

  // Regression: b383d00 — transferBetweenEnvelopes read the destination's
  // type and targetAmount before the transaction, so a goal target lowered
  // concurrently was never seen and a transfer could leave the goal above
  // it. The lock statement now returns both rows' type and target, and the
  // ceiling guard runs against those.
  it("guards a GOAL destination against the target returned by the lock", async () => {
    const { tx, calls, getLockSql } = makeTransferTx(
      {
        s: [{ amount: 500, type: "FILL" }],
        d: [{ amount: 900, type: "FILL" }],
      },
      { d: { type: "GOAL", targetAmount: 950 } }
    );
    const result = await runTransferWrite(tx, { ...base, amount: 100 });
    expect(getLockSql()).toContain("target_amount");
    expect(result.error).toContain("dépasse l'objectif");
    expect(calls).toEqual(["lock", "findMany", "findMany"]);
  });

  // Regression: b1cc5ca — runTransferWrite never read is_archived, so a
  // stale tab could move money into an archived envelope (where it vanished
  // from every view) or out of one. The lock statement now returns
  // is_archived for both rows and either side archived refuses the write.
  it("refuses a transfer into an envelope the lock reports as archived", async () => {
    const { tx, calls, getLockSql } = makeTransferTx(
      { s: [{ amount: 500, type: "FILL" }] },
      { d: { type: "GOAL", targetAmount: 1000, isArchived: true } }
    );
    const result = await runTransferWrite(tx, { ...base, amount: 100 });
    expect(getLockSql()).toContain("is_archived");
    expect(result.error).toBe("L'enveloppe destination a été archivée. Rechargez la page.");
    expect(calls).toEqual(["lock"]);
  });

  it("refuses a transfer out of an envelope the lock reports as archived", async () => {
    const { tx, calls } = makeTransferTx(
      { s: [{ amount: 500, type: "FILL" }] },
      { s: { type: "BUDGET", targetAmount: null, isArchived: true } }
    );
    const result = await runTransferWrite(tx, { ...base, amount: 100 });
    expect(result.error).toBe("L'enveloppe source a été archivée. Rechargez la page.");
    expect(calls).toEqual(["lock"]);
  });

  it("does not write when either envelope is gone by the time the lock is taken", async () => {
    const calls: string[] = [];
    const tx: TransferTx = {
      $queryRaw: async () => {
        calls.push("lock");
        return [{ id: "s", type: "BUDGET", targetAmount: null }];
      },
      envelopeTransaction: {
        findMany: async () => {
          calls.push("findMany");
          return [{ amount: 100, type: "FILL" }];
        },
        create: async () => {
          calls.push("create");
          return { id: "x" };
        },
        update: async () => {
          calls.push("update");
          return {};
        },
      },
    };
    const result = await runTransferWrite(tx, base);
    expect(result.error).toBe("Enveloppe destination introuvable");
    expect(calls).toEqual(["lock"]);
  });

  it("creates TRANSFER_OUT then TRANSFER_IN then links them, after both checks pass", async () => {
    const { tx, calls } = makeTransferTx({ s: [{ amount: 100, type: "FILL" }] });
    const result = await runTransferWrite(tx, base);
    expect(result).toEqual({ error: null });
    expect(calls).toEqual(["lock", "findMany", "create", "create", "update"]);
  });
});

function makeGoalTargetUpdateTx(
  existing: { amount: number; type: "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT" }[],
  found = true
) {
  const calls: string[] = [];
  let lockSql = "";
  let lockValues: unknown[] = [];
  let updateArgs: unknown = null;
  const tx: GoalTargetUpdateTx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push("lock");
      lockSql = strings.join("?");
      lockValues = values;
      return found ? [{ id: "g" }] : [];
    },
    envelopeTransaction: {
      findMany: async () => {
        calls.push("findMany");
        return existing;
      },
    },
    envelope: {
      update: async (args) => {
        calls.push("update");
        updateArgs = args;
        return {};
      },
    },
  };
  return { tx, calls, getLockSql: () => lockSql, getLockValues: () => lockValues, getUpdateArgs: () => updateArgs };
}

describe("runGoalTargetUpdate", () => {
  const data = {
    name: "Vacances",
    targetAmount: 950,
    targetDate: null,
    icon: null,
    color: null,
  };

  // Regression: b383d00 — updateGoalEnvelope read the balance, compared it
  // with the new target and wrote the target without any lock, so a deposit
  // or transfer committing between its read and its write left the goal
  // above the new target. It now takes the same row lock as the GOAL fill
  // and the transfer, before reading the balance, so the two serialize.
  it("locks the goal row with FOR NO KEY UPDATE before reading the balance, then updates", async () => {
    const { tx, calls, getLockSql, getLockValues, getUpdateArgs } = makeGoalTargetUpdateTx([
      { amount: 900, type: "FILL" },
    ]);
    const result = await runGoalTargetUpdate(tx, { envelopeId: "g", householdId: "h", data });
    expect(result).toEqual({ error: null });
    expect(calls).toEqual(["lock", "findMany", "update"]);
    const sql = getLockSql();
    expect(sql).toContain("FOR NO KEY UPDATE");
    expect(sql).not.toMatch(/\bFOR UPDATE\b/);
    expect(sql).toContain("'GOAL'");
    expect(getLockValues()).toEqual(["g", "h"]);
    expect(getUpdateArgs()).toEqual({ where: { id: "g", householdId: "h" }, data });
  });

  it("refuses a target below the balance read under the lock, without writing", async () => {
    const { tx, calls } = makeGoalTargetUpdateTx([{ amount: 1000, type: "FILL" }]);
    const result = await runGoalTargetUpdate(tx, { envelopeId: "g", householdId: "h", data });
    // The thousands separator comes from the ICU data, so it is built, not pinned.
    expect(result.error).toBe(`L'objectif ne peut pas être inférieur au solde actuel (${formatCurrency(1000)}).`);
    expect(calls).toEqual(["lock", "findMany"]);
  });

  it("answers not found when the lock matches no goal of this household", async () => {
    const { tx, calls } = makeGoalTargetUpdateTx([], false);
    const result = await runGoalTargetUpdate(tx, { envelopeId: "g", householdId: "h", data });
    expect(result.error).toBe("Objectif introuvable");
    expect(calls).toEqual(["lock"]);
  });
});

describe("runGoalTargetUpdate compares money through money.ts", () => {
  // Regression: 75746c0 — updateGoalEnvelope compared with a raw `<`: fills
  // of 1,10 € and 2,20 € sum to 3.3000000000000003 as doubles, so setting
  // the target to 3,30 € was refused as "below the current balance
  // (3.30 €)". The comparison now goes through amountGreaterThan.
  it("accepts a target equal to a balance that carries float dust", async () => {
    const { tx, calls } = makeGoalTargetUpdateTx([
      { amount: 1.1, type: "FILL" },
      { amount: 2.2, type: "FILL" },
    ]);
    const result = await runGoalTargetUpdate(tx, {
      envelopeId: "g",
      householdId: "h",
      data: { name: "Vacances", targetAmount: 3.3, targetDate: null, icon: null, color: null },
    });
    expect(result).toEqual({ error: null });
    expect(calls).toEqual(["lock", "findMany", "update"]);
  });

  it("still refuses a target one cent below the balance", async () => {
    const { tx } = makeGoalTargetUpdateTx([
      { amount: 1.1, type: "FILL" },
      { amount: 2.2, type: "FILL" },
    ]);
    const result = await runGoalTargetUpdate(tx, {
      envelopeId: "g",
      householdId: "h",
      data: { name: "Vacances", targetAmount: 3.29, targetDate: null, icon: null, color: null },
    });
    expect(result.error).toBe("L'objectif ne peut pas être inférieur au solde actuel (3,30\u00A0€).");
  });
});

function makeArchiveTx(
  row: { id: string; type: "BUDGET" | "GOAL"; isArchived: boolean } | null,
  existing: { amount: number; type: "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT" }[]
) {
  const calls: string[] = [];
  let lockSql = "";
  let lockValues: unknown[] = [];
  let updateArgs: unknown = null;
  const tx: ArchiveTx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push("lock");
      lockSql = strings.join("?");
      lockValues = values;
      return row ? [row] : [];
    },
    envelopeTransaction: {
      findMany: async () => {
        calls.push("findMany");
        return existing;
      },
    },
    envelope: {
      update: async (args) => {
        calls.push("update");
        updateArgs = args;
        return {};
      },
    },
  };
  return { tx, calls, getLockSql: () => lockSql, getLockValues: () => lockValues, getUpdateArgs: () => updateArgs };
}

describe("runArchiveWrite", () => {
  const closeGoal = {
    envelopeId: "g",
    householdId: "h",
    goalOnly: true,
    errors: { notFound: "Objectif introuvable", nonZeroBalance: "Transférez le solde avant de clôturer." },
  };
  const archive = {
    envelopeId: "g",
    householdId: "h",
    goalOnly: false,
    errors: { notFound: "Enveloppe introuvable", nonZeroBalance: "Transférez le solde avant d'archiver." },
  };

  // Regression: b1cc5ca — closeGoalEnvelope and archiveEnvelope read the
  // balance, checked it was zero and archived with no lock, so a deposit
  // committing between the check and the UPDATE was left in an archived
  // goal. They now take the goal fill's and the transfer's row lock before
  // reading the balance, and archive inside that transaction.
  it("locks the row with FOR NO KEY UPDATE before reading the balance, then archives", async () => {
    const { tx, calls, getLockSql, getLockValues, getUpdateArgs } = makeArchiveTx(
      { id: "g", type: "GOAL", isArchived: false },
      [
        { amount: 1.1, type: "FILL" },
        { amount: 1.1, type: "TRANSFER_OUT" },
      ]
    );
    const result = await runArchiveWrite(tx, closeGoal);
    expect(result).toEqual({ error: null });
    expect(calls).toEqual(["lock", "findMany", "update"]);
    const sql = getLockSql();
    expect(sql).toContain("FOR NO KEY UPDATE");
    expect(sql).not.toMatch(/\bFOR UPDATE\b/);
    expect(getLockValues()).toEqual(["g", "h"]);
    expect(getUpdateArgs()).toEqual({ where: { id: "g", householdId: "h" }, data: { isArchived: true } });
  });

  it("refuses to archive a goal whose balance read under the lock is not zero", async () => {
    const { tx, calls } = makeArchiveTx({ id: "g", type: "GOAL", isArchived: false }, [{ amount: 200, type: "FILL" }]);
    const result = await runArchiveWrite(tx, closeGoal);
    expect(result.error).toBe("Transférez le solde avant de clôturer.");
    expect(calls).toEqual(["lock", "findMany"]);
  });

  it("archives a BUDGET envelope whatever its balance, without reading it", async () => {
    const { tx, calls } = makeArchiveTx({ id: "g", type: "BUDGET", isArchived: false }, [{ amount: 200, type: "FILL" }]);
    const result = await runArchiveWrite(tx, archive);
    expect(result).toEqual({ error: null });
    expect(calls).toEqual(["lock", "update"]);
  });

  it("answers not found when the lock matches no row of this household", async () => {
    const { tx, calls } = makeArchiveTx(null, []);
    expect(await runArchiveWrite(tx, archive)).toEqual({ error: "Enveloppe introuvable" });
    expect(calls).toEqual(["lock"]);
  });

  it("answers not found when a goal-only close meets a BUDGET envelope", async () => {
    const { tx, calls } = makeArchiveTx({ id: "g", type: "BUDGET", isArchived: false }, []);
    expect(await runArchiveWrite(tx, closeGoal)).toEqual({ error: "Objectif introuvable" });
    expect(calls).toEqual(["lock"]);
  });
});

describe("runDeleteTransactionWrite", () => {
  function makeDeleteTx(reads: ({ envelopeId: string; linkedTransactionId: string | null } | null)[]) {
    const calls: string[] = [];
    const queue = [...reads];
    let lockSql = "";
    let lockValues: unknown[] = [];
    const tx: DeleteTransactionTx = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push("lock");
        lockSql = strings.join("?");
        lockValues = values;
        const [joined] = values as [{ values: string[] }];
        return joined.values.map((id) => ({ id, isArchived: false }));
      },
      envelopeTransaction: {
        findUnique: async () => {
          calls.push("findUnique");
          return queue.shift() ?? null;
        },
        update: async () => {
          calls.push("update");
          return {};
        },
        delete: async () => {
          calls.push("delete");
          return {};
        },
      },
    };
    return { tx, calls, getLockSql: () => lockSql, getLockValues: () => lockValues };
  }

  it("locks both legs' envelopes with FOR NO KEY UPDATE, sorted and distinct, filtered by household", async () => {
    const { tx, calls, getLockSql, getLockValues } = makeDeleteTx([
      { envelopeId: "zeta", linkedTransactionId: "l" },
      { envelopeId: "alpha", linkedTransactionId: "t" },
      { envelopeId: "zeta", linkedTransactionId: "l" },
    ]);
    expect(await runDeleteTransactionWrite(tx, { transactionId: "t", householdId: "h" })).toEqual({ error: null });
    const sql = getLockSql();
    expect(sql).toContain("FOR NO KEY UPDATE");
    expect(sql).not.toMatch(/\bFOR UPDATE\b/);
    expect(sql).toContain("ORDER BY id");
    expect(sql).toContain("household_id");
    expect(sql).toContain("is_archived");
    const [joined, householdId] = getLockValues() as [{ values: string[] }, string];
    expect(joined.values).toEqual(["alpha", "zeta"]);
    expect(householdId).toBe("h");
    expect(calls.indexOf("lock")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("update")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("lock")).toBeLessThan(calls.indexOf("update"));
  });

  it("locks an envelope once when both legs of a transfer sit in it", async () => {
    const { tx, getLockValues } = makeDeleteTx([
      { envelopeId: "b", linkedTransactionId: "l" },
      { envelopeId: "b", linkedTransactionId: "t" },
      { envelopeId: "b", linkedTransactionId: "l" },
    ]);
    await runDeleteTransactionWrite(tx, { transactionId: "t", householdId: "h" });
    const [joined] = getLockValues() as [{ values: string[] }];
    expect(joined.values).toEqual(["b"]);
  });

  it("treats a row deleted by a concurrent request while waiting on the lock as success", async () => {
    const { tx, calls } = makeDeleteTx([{ envelopeId: "b", linkedTransactionId: null }, null]);
    expect(await runDeleteTransactionWrite(tx, { transactionId: "t", householdId: "h" })).toEqual({ error: null });
    expect(calls).toEqual(["findUnique", "lock", "findUnique"]);
  });

  it("refuses to delete a pair whose other leg was not read before the lock", async () => {
    const { tx, calls } = makeDeleteTx([
      { envelopeId: "b", linkedTransactionId: "l" },
      null,
      { envelopeId: "b", linkedTransactionId: "l" },
    ]);
    expect(await runDeleteTransactionWrite(tx, { transactionId: "t", householdId: "h" })).toEqual({
      error: "Cette opération a changé entre-temps. Rechargez la page.",
    });
    expect(calls).toEqual(["findUnique", "findUnique", "lock", "findUnique"]);
  });
});
