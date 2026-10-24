import { describe, it, expect } from "vitest";
import { backupSchema } from "./backup";
import {
  collectTransferLinks,
  validatePayloadIntegrity,
  type TransferLink,
} from "@/lib/backup-helpers";
import type { BackupData } from "./backup";

function makeValidBackup(overrides: Record<string, unknown> = {}) {
  return {
    meta: { version: 1, exportedAt: "2026-02-15T12:00:00.000Z", app: "budgetor" },
    household: { income: 5000 },
    envelopes: [],
    recurringCharges: [],
    treasury: null,
    ...overrides,
  };
}

// Minimal valid envelope with BUDGET type
function makeBudgetEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    id: "env-1",
    name: "Courses",
    type: "BUDGET",
    monthlyBudget: 500,
    icon: null,
    color: "#f59e0b",
    sortOrder: 0,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    transactions: [],
    ...overrides,
  };
}

// Minimal valid GOAL envelope with null monthlyBudget
function makeGoalEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    id: "env-goal-1",
    name: "Vacances",
    type: "GOAL",
    monthlyBudget: null,
    targetAmount: 2000,
    targetDate: "2026-12-31",
    icon: null,
    color: null,
    sortOrder: 1,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    transactions: [],
    ...overrides,
  };
}

describe("backupSchema", () => {
  it("accepts a valid minimal backup (empty arrays, null optionals)", () => {
    const result = backupSchema.safeParse(makeValidBackup());
    expect(result.success).toBe(true);
  });

  it("accepts a full backup with all data types populated", () => {
    const full = makeValidBackup({
      envelopes: [
        {
          id: "env-1",
          name: "Courses",
          monthlyBudget: 500,
          icon: null,
          color: "#f59e0b",
          sortOrder: 0,
          isArchived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          transactions: [
            {
              id: "tx-1",
              date: "2026-01-15",
              amount: 42.5,
              type: "SPEND",
              description: "Supermarche",
              createdAt: "2026-01-15T10:00:00.000Z",
            },
            {
              id: "tx-2",
              date: "2026-01-01",
              amount: 500,
              type: "FILL",
              description: null,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
      recurringCharges: [
        {
          id: "rc-1",
          name: "Loyer",
          amount: 1200,
          dayOfMonth: 5,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      treasury: {
        id: "tr-1",
        balance: 350.75,
        createdAt: "2026-01-01T00:00:00.000Z",
        adjustments: [
          {
            id: "adj-1",
            amount: 350.75,
            type: "SET",
            label: "Solde initial",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    const result = backupSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("rejects wrong version", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({ meta: { version: 2, exportedAt: "2026-02-15T12:00:00.000Z", app: "budgetor" } })
    );
    expect(result.success).toBe(false);
  });

  it("rejects wrong app name", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({ meta: { version: 1, exportedAt: "2026-02-15T12:00:00.000Z", app: "other-app" } })
    );
    expect(result.success).toBe(false);
  });

  it("rejects negative income", () => {
    const result = backupSchema.safeParse(makeValidBackup({ household: { income: -100 } }));
    expect(result.success).toBe(false);
  });

  it("rejects invalid transaction type enum", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [
          {
            id: "env-1",
            name: "Test",
            monthlyBudget: 100,
            icon: null,
            color: null,
            sortOrder: 0,
            isArchived: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            transactions: [
              {
                id: "tx-1",
                date: "2026-01-15",
                amount: 10,
                type: "TRANSFER",
                description: null,
                createdAt: "2026-01-15T00:00:00.000Z",
              },
            ],
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it("rejects empty envelope id", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [
          {
            id: "",
            name: "Test",
            monthlyBudget: 100,
            icon: null,
            color: null,
            sortOrder: 0,
            isArchived: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            transactions: [],
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it("rejects dayOfMonth out of range (0)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        recurringCharges: [
          {
            id: "rc-1",
            name: "Test",
            amount: 100,
            dayOfMonth: 0,
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it("rejects dayOfMonth out of range (32)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        recurringCharges: [
          {
            id: "rc-1",
            name: "Test",
            amount: 100,
            dayOfMonth: 32,
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  // Regression: 1d6df48 — the backup schema required every treasury
  // adjustment amount to be strictly positive, but setTreasuryBalance
  // accepts 0 (a SET of 0,00 €) and refreshTreasuryTotal writes the pools'
  // sum, which is 0 with no pool. One such row made the whole backup of
  // that household unrestorable. A SET or REFRESH may carry 0; a DEDUCT,
  // which the live writer requires to be positive, still may not.
  describe("treasury adjustment amounts follow the live writers", () => {
    function withAdjustment(type: string, amount: number) {
      return makeValidBackup({
        treasury: {
          id: "tr-1",
          balance: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          adjustments: [
            {
              id: "adj-1",
              amount,
              type,
              label: null,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      });
    }

    it.each(["SET", "REFRESH"])("accepts a %s adjustment of 0", (type) => {
      expect(backupSchema.safeParse(withAdjustment(type, 0)).success).toBe(true);
    });

    it.each(["SET", "REFRESH", "DEDUCT"])("accepts a positive %s adjustment", (type) => {
      expect(backupSchema.safeParse(withAdjustment(type, 12.5)).success).toBe(true);
    });

    it("rejects a DEDUCT adjustment of 0", () => {
      const result = backupSchema.safeParse(withAdjustment("DEDUCT", 0));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["treasury", "adjustments", 0, "amount"]);
        expect(result.error.issues[0].message).toBe("Le montant doit être positif");
      }
    });

    it("rejects a DEDUCT adjustment that rounds to 0,00 €", () => {
      expect(backupSchema.safeParse(withAdjustment("DEDUCT", 0.004)).success).toBe(false);
      expect(backupSchema.safeParse(withAdjustment("DEDUCT", 0.005)).success).toBe(true);
    });

    it.each(["SET", "REFRESH", "DEDUCT"])("rejects a negative %s adjustment", (type) => {
      expect(backupSchema.safeParse(withAdjustment(type, -1)).success).toBe(false);
    });

    it.each(["SET", "REFRESH", "DEDUCT"])("rejects a %s adjustment above the ceiling", (type) => {
      expect(backupSchema.safeParse(withAdjustment(type, 10_000_000_000)).success).toBe(false);
    });
  });

  // Regression: 41adb48 — the treasury balance was nonNegativeMoney, but
  // deductFromTreasury decrements the balance with no floor, so a live
  // balance can be negative. Such a household's backup could never be
  // restored. The balance now accepts anything the Decimal(12,2) column
  // can hold, negative included, and still rejects non-finite values.
  describe("treasury balance follows what the live writers can store", () => {
    function withBalance(balance: number) {
      return makeValidBackup({
        treasury: { id: "tr-1", balance, createdAt: "2026-01-01T00:00:00.000Z", adjustments: [] },
      });
    }

    it.each([-250.5, -0.01, 0, 1234.56, -9_999_999_999.99, 9_999_999_999.99])(
      "accepts a balance of %d",
      (balance) => {
        expect(backupSchema.safeParse(withBalance(balance)).success).toBe(true);
      }
    );

    it.each([-10_000_000_000, 10_000_000_000, Infinity, -Infinity, NaN])(
      "rejects a balance of %d",
      (balance) => {
        expect(backupSchema.safeParse(withBalance(balance)).success).toBe(false);
      }
    );
  });

  it("rejects invalid treasury adjustment type", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        treasury: {
          id: "tr-1",
          balance: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          adjustments: [
            {
              id: "adj-1",
              amount: 100,
              type: "ADD",
              label: null,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      })
    );
    expect(result.success).toBe(false);
  });

  it("accepts a goal envelope in backup data", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [
          {
            id: "env-goal-1",
            name: "Casque audio",
            type: "GOAL",
            monthlyBudget: null,
            targetAmount: 300,
            targetDate: "2026-12-01",
            icon: "🎧",
            color: "#a855f7",
            sortOrder: 1,
            isArchived: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            transactions: [],
          },
        ],
      })
    );
    expect(result.success).toBe(true);
  });

  it("accepts TRANSFER_IN and TRANSFER_OUT transaction types", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [
          {
            id: "env-1",
            name: "Courses",
            type: "BUDGET",
            monthlyBudget: 500,
            icon: null,
            color: null,
            sortOrder: 0,
            isArchived: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            transactions: [
              {
                id: "tx-in",
                date: "2026-03-15",
                amount: 50,
                type: "TRANSFER_IN",
                description: null,
                linkedTransactionId: "tx-out",
                createdAt: "2026-03-15T10:00:00.000Z",
              },
              {
                id: "tx-out",
                date: "2026-03-15",
                amount: 50,
                type: "TRANSFER_OUT",
                description: "Transfert",
                linkedTransactionId: "tx-in",
                createdAt: "2026-03-15T10:00:00.000Z",
              },
            ],
          },
        ],
      })
    );
    expect(result.success).toBe(true);
  });

  it("accepts legacy budget envelopes without type field (backwards compatibility)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [
          {
            id: "env-legacy",
            name: "Loisirs",
            monthlyBudget: 200,
            icon: null,
            color: null,
            sortOrder: 0,
            isArchived: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            transactions: [],
          },
        ],
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.envelopes[0].type).toBe("BUDGET");
    }
  });

  it("accepts legacy envelopes without linkedTransactionId (backwards compatibility)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [
          {
            id: "env-1",
            name: "Courses",
            monthlyBudget: 500,
            icon: null,
            color: null,
            sortOrder: 0,
            isArchived: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            transactions: [
              {
                id: "tx-1",
                date: "2026-01-15",
                amount: 42.5,
                type: "SPEND",
                description: null,
                createdAt: "2026-01-15T00:00:00.000Z",
              },
            ],
          },
        ],
      })
    );
    expect(result.success).toBe(true);
  });

  // ─── Finding 16: GOAL monthlyBudget NULL round-trip ─────────────────────────

  it("preserves null monthlyBudget for GOAL envelopes (Finding 16 round-trip)", () => {
    const raw = makeValidBackup({
      envelopes: [makeGoalEnvelope({ monthlyBudget: null })],
    });
    const result = backupSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      // null must survive parsing — must NOT be coerced to 0
      expect(result.data.envelopes[0].monthlyBudget).toBeNull();
    }
  });

  it("still defaults monthlyBudget to 0 when field is absent (legacy compatibility)", () => {
    const env = { ...makeBudgetEnvelope() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (env as any).monthlyBudget;
    const result = backupSchema.safeParse(makeValidBackup({ envelopes: [env] }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.envelopes[0].monthlyBudget).toBe(0);
    }
  });

  // ─── Finding 53: Array size limits ──────────────────────────────────────────

  it("rejects backup with more than 200 envelopes", () => {
    const envelopes = Array.from({ length: 201 }, (_, i) =>
      makeBudgetEnvelope({ id: `env-${i}`, name: `Enveloppe ${i}` })
    );
    const result = backupSchema.safeParse(makeValidBackup({ envelopes }));
    expect(result.success).toBe(false);
  });

  it("rejects an envelope with more than 20 000 transactions", () => {
    const transactions = Array.from({ length: 20_001 }, (_, i) => ({
      id: `tx-${i}`,
      date: "2026-01-15",
      amount: 1,
      type: "SPEND",
      description: null,
      createdAt: "2026-01-15T00:00:00.000Z",
    }));
    const result = backupSchema.safeParse(
      makeValidBackup({ envelopes: [makeBudgetEnvelope({ transactions })] })
    );
    expect(result.success).toBe(false);
  });

  // ─── Finding 54: Monetary bounds ────────────────────────────────────────────

  it("rejects negative recurring charge amount (Finding 54)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        recurringCharges: [
          {
            id: "rc-1",
            name: "Loyer",
            amount: -100,
            dayOfMonth: 5,
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it("rejects negative transaction amount (Finding 54)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [
          makeBudgetEnvelope({
            transactions: [
              {
                id: "tx-1",
                date: "2026-01-15",
                amount: -50,
                type: "SPEND",
                description: null,
                createdAt: "2026-01-15T00:00:00.000Z",
              },
            ],
          }),
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it("rejects amount above Decimal(12,2) maximum (Finding 54)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        recurringCharges: [
          {
            id: "rc-1",
            name: "Loyer",
            amount: 10_000_000_000,
            dayOfMonth: 5,
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  // ─── Finding 55: Date and monthKey validation ─────────────────────────────

  it("rejects garbage transaction date (Finding 55)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [
          makeBudgetEnvelope({
            transactions: [
              {
                id: "tx-1",
                date: "garbage",
                amount: 10,
                type: "SPEND",
                description: null,
                createdAt: "2026-01-15T00:00:00.000Z",
              },
            ],
          }),
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it("rejects invalid targetDate string (Finding 55)", () => {
    const result = backupSchema.safeParse(
      makeValidBackup({
        envelopes: [makeGoalEnvelope({ targetDate: "not-a-date" })],
      })
    );
    expect(result.success).toBe(false);
  });

  // ─── Legacy key compatibility (savings ledger removal) ──────────────────────

  it("defaults an envelope's fillCadence to WEEKLY for backups made before the field existed", () => {
    const backup = makeValidBackup({ envelopes: [makeBudgetEnvelope()] });
    delete (backup.envelopes[0] as { fillCadence?: string }).fillCadence;
    const result = backupSchema.safeParse(backup);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.envelopes[0].fillCadence).toBe("WEEKLY");
  });

  it("accepts and ignores legacy savingsAccount and autoSaveLogs keys (savings ledger removal)", () => {
    // Regression: a backup file exported before the savings ledger was removed
    // still carries the now-dead savingsAccount / autoSaveLogs / notifications
    // keys. The schema must accept and silently strip them rather than reject
    // the whole file, so an old export still restores.
    const legacyPayload = makeValidBackup({
      savingsAccount: {
        id: "sa-1",
        balance: 1000,
        createdAt: "2026-01-01T00:00:00.000Z",
        deposits: [
          {
            id: "dep-1",
            amount: 1000,
            label: "Epargne janvier",
            monthKey: "2026-01",
            createdAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      },
      autoSaveLogs: [
        {
          id: "asl-1",
          monthKey: "2026-01",
          amount: 200,
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      notifications: [
        {
          id: "notif-1",
          userId: "user-1",
          type: "AUTO_SAVE",
          monthKey: "2026-01",
          payload: null,
          readAt: null,
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    const result = backupSchema.safeParse(legacyPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("savingsAccount");
      expect(result.data).not.toHaveProperty("autoSaveLogs");
      expect(result.data).not.toHaveProperty("notifications");
    }
  });
});

// ─── Pure helper unit tests ────────────────────────────────────────────────────

describe("collectTransferLinks", () => {
  it("returns empty array when no transactions have linkedTransactionId", () => {
    const data = backupSchema.parse(
      makeValidBackup({ envelopes: [makeBudgetEnvelope()] })
    );
    expect(collectTransferLinks(data)).toEqual([]);
  });

  it("collects all linked pairs from a cross-envelope transfer", () => {
    const raw = makeValidBackup({
      envelopes: [
        makeBudgetEnvelope({
          id: "env-src",
          transactions: [
            {
              id: "tx-out",
              date: "2026-03-15",
              amount: 100,
              type: "TRANSFER_OUT",
              description: null,
              linkedTransactionId: "tx-in",
              createdAt: "2026-03-15T00:00:00.000Z",
            },
          ],
        }),
        makeBudgetEnvelope({
          id: "env-dst",
          name: "Loisirs",
          transactions: [
            {
              id: "tx-in",
              date: "2026-03-15",
              amount: 100,
              type: "TRANSFER_IN",
              description: null,
              linkedTransactionId: "tx-out",
              createdAt: "2026-03-15T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    const data = backupSchema.parse(raw);
    const links = collectTransferLinks(data);
    expect(links).toHaveLength(2);
    const byId: Record<string, TransferLink> = Object.fromEntries(links.map((l) => [l.id, l]));
    expect(byId["tx-out"].linkedTransactionId).toBe("tx-in");
    expect(byId["tx-in"].linkedTransactionId).toBe("tx-out");
  });

  it("ignores transactions with null linkedTransactionId", () => {
    const raw = makeValidBackup({
      envelopes: [
        makeBudgetEnvelope({
          transactions: [
            {
              id: "tx-1",
              date: "2026-01-15",
              amount: 50,
              type: "SPEND",
              description: null,
              linkedTransactionId: null,
              createdAt: "2026-01-15T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    const data = backupSchema.parse(raw);
    expect(collectTransferLinks(data)).toEqual([]);
  });
});

describe("validatePayloadIntegrity", () => {
  it("returns null for a backup with no linked transactions", () => {
    const data = backupSchema.parse(makeValidBackup());
    expect(validatePayloadIntegrity(data)).toBeNull();
  });

  it("returns null for a valid symmetric transfer pair", () => {
    const raw = makeValidBackup({
      envelopes: [
        makeBudgetEnvelope({
          id: "env-src",
          transactions: [
            {
              id: "tx-out",
              date: "2026-03-15",
              amount: 100,
              type: "TRANSFER_OUT",
              description: null,
              linkedTransactionId: "tx-in",
              createdAt: "2026-03-15T00:00:00.000Z",
            },
          ],
        }),
        makeBudgetEnvelope({
          id: "env-dst",
          name: "Loisirs",
          transactions: [
            {
              id: "tx-in",
              date: "2026-03-15",
              amount: 100,
              type: "TRANSFER_IN",
              description: null,
              linkedTransactionId: "tx-out",
              createdAt: "2026-03-15T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    const data = backupSchema.parse(raw);
    expect(validatePayloadIntegrity(data)).toBeNull();
  });

  it("returns an error message when linkedTransactionId references a foreign id (Finding 18)", () => {
    // tx-foreign does not exist in this backup
    const raw = makeValidBackup({
      envelopes: [
        makeBudgetEnvelope({
          transactions: [
            {
              id: "tx-out",
              date: "2026-03-15",
              amount: 100,
              type: "TRANSFER_OUT",
              description: null,
              linkedTransactionId: "tx-foreign-household-id",
              createdAt: "2026-03-15T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    const data = backupSchema.parse(raw);
    const error = validatePayloadIntegrity(data);
    expect(error).not.toBeNull();
    expect(error).toMatch(/identifiant absent du fichier/);
  });

  it("returns an error message when transfer pair types are asymmetric (Finding 18)", () => {
    // Both transactions claim TRANSFER_OUT → not a valid IN/OUT pair
    const raw = makeValidBackup({
      envelopes: [
        makeBudgetEnvelope({
          id: "env-a",
          transactions: [
            {
              id: "tx-a",
              date: "2026-03-15",
              amount: 100,
              type: "TRANSFER_OUT",
              description: null,
              linkedTransactionId: "tx-b",
              createdAt: "2026-03-15T00:00:00.000Z",
            },
          ],
        }),
        makeBudgetEnvelope({
          id: "env-b",
          name: "Autre",
          transactions: [
            {
              id: "tx-b",
              date: "2026-03-15",
              amount: 100,
              type: "TRANSFER_OUT",
              description: null,
              linkedTransactionId: "tx-a",
              createdAt: "2026-03-15T00:00:00.000Z",
            },
          ],
        }),
      ],
    });
    const data = backupSchema.parse(raw);
    const error = validatePayloadIntegrity(data);
    expect(error).not.toBeNull();
    expect(error).toMatch(/paires symétriques/);
  });
});

// ─── Round-trip integration test (Finding 16 + Finding 6) ─────────────────────

describe("export/import round-trip", () => {
  /**
   * Simulates the serialization done by exportHouseholdData (pure transformation
   * layer only — no DB) and then validates + transforms with backupSchema.
   *
   * The test asserts:
   *   1. GOAL envelope null monthlyBudget survives the round-trip.
   *   2. Transfer pair links survive schema parsing.
   *   3. collectTransferLinks returns symmetric pairs (ready for pass-2 re-linking).
   *   4. validatePayloadIntegrity clears for the payload.
   */
  it("preserves GOAL null monthlyBudget and cross-envelope transfer links", () => {
    // Simulate what exportHouseholdData returns from the DB
    const exported = {
      meta: { version: 1 as const, exportedAt: "2026-06-01T00:00:00.000Z", app: "budgetor" as const },
      household: { income: 4000 },
      envelopes: [
        // GOAL envelope with null monthlyBudget
        {
          id: "env-goal",
          name: "Voyage",
          type: "GOAL" as const,
          monthlyBudget: null, // DB value: NULL
          targetAmount: 3000,
          targetDate: "2026-12-31",
          icon: null,
          color: null,
          sortOrder: 0,
          isArchived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          transactions: [],
        },
        // Source envelope for transfer
        {
          id: "env-src",
          name: "Courses",
          type: "BUDGET" as const,
          monthlyBudget: 500,
          targetAmount: null,
          targetDate: null,
          icon: null,
          color: null,
          sortOrder: 1,
          isArchived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          transactions: [
            {
              id: "tx-out",
              date: "2026-03-10",
              amount: 200,
              type: "TRANSFER_OUT" as const,
              description: "Vers vacances",
              linkedTransactionId: "tx-in",
              createdAt: "2026-03-10T10:00:00.000Z",
            },
          ],
        },
        // Destination envelope for transfer
        {
          id: "env-dst",
          name: "Vacances",
          type: "BUDGET" as const,
          monthlyBudget: 0,
          targetAmount: null,
          targetDate: null,
          icon: null,
          color: null,
          sortOrder: 2,
          isArchived: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          transactions: [
            {
              id: "tx-in",
              date: "2026-03-10",
              amount: 200,
              type: "TRANSFER_IN" as const,
              description: "Depuis courses",
              linkedTransactionId: "tx-out",
              createdAt: "2026-03-10T10:00:00.000Z",
            },
          ],
        },
      ],
      recurringCharges: [],
      treasury: null,
    };

    // Step 1: schema validation passes
    const parseResult = backupSchema.safeParse(exported);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;
    const data: BackupData = parseResult.data;

    // Step 2: GOAL monthlyBudget is preserved as null
    const goalEnv = data.envelopes.find((e) => e.id === "env-goal");
    expect(goalEnv).toBeDefined();
    expect(goalEnv!.monthlyBudget).toBeNull();

    // Step 3: transfer links survive parsing
    const srcTx = data.envelopes
      .find((e) => e.id === "env-src")
      ?.transactions.find((t) => t.id === "tx-out");
    const dstTx = data.envelopes
      .find((e) => e.id === "env-dst")
      ?.transactions.find((t) => t.id === "tx-in");
    expect(srcTx?.linkedTransactionId).toBe("tx-in");
    expect(dstTx?.linkedTransactionId).toBe("tx-out");

    // Step 4: payload integrity passes
    expect(validatePayloadIntegrity(data)).toBeNull();

    // Step 5: collectTransferLinks returns both sides of the pair
    const links = collectTransferLinks(data);
    expect(links).toHaveLength(2);
    const linkMap: Record<string, string> = Object.fromEntries(
      links.map((l) => [l.id, l.linkedTransactionId])
    );
    expect(linkMap["tx-out"]).toBe("tx-in");
    expect(linkMap["tx-in"]).toBe("tx-out");
  });
});
