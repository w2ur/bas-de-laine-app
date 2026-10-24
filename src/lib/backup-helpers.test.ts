import { describe, it, expect } from "vitest";
import { collectTransferLinks, validatePayloadIntegrity } from "./backup-helpers";
import type { BackupData } from "@/lib/schemas/backup";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBackup(overrides: Partial<BackupData> = {}): BackupData {
  return {
    meta: { version: 1, exportedAt: "2026-09-13T00:00:00.000Z", app: "budgetor" },
    household: { income: 3000 },
    envelopes: [],
    recurringCharges: [],
    treasury: null,
    ...overrides,
  };
}

function makeEnvelope(id: string, transactions: BackupData["envelopes"][number]["transactions"] = []) {
  return {
    id,
    name: `Enveloppe ${id}`,
    type: "BUDGET" as const,
    monthlyBudget: 100,
    fillCadence: "WEEKLY" as const,
    targetAmount: null,
    targetDate: null,
    icon: null,
    color: null,
    sortOrder: 0,
    isArchived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    transactions,
  };
}

function makeTx(id: string, type: "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT", linkedTransactionId: string | null = null) {
  return {
    id,
    date: "2026-01-15",
    amount: 10,
    type,
    description: null,
    linkedTransactionId,
    createdAt: "2026-01-15T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// collectTransferLinks
// ---------------------------------------------------------------------------

describe("collectTransferLinks", () => {
  it("collects only transactions that carry a linkedTransactionId", () => {
    const data = makeBackup({
      envelopes: [
        makeEnvelope("env-1", [makeTx("tx-1", "TRANSFER_OUT", "tx-2"), makeTx("tx-3", "FILL")]),
      ],
    });
    const links = collectTransferLinks(data);
    expect(links).toEqual([{ id: "tx-1", linkedTransactionId: "tx-2" }]);
  });
});

// ---------------------------------------------------------------------------
// validatePayloadIntegrity
// ---------------------------------------------------------------------------

describe("validatePayloadIntegrity", () => {
  it("returns null for a valid payload with symmetric transfer pairs", () => {
    const data = makeBackup({
      envelopes: [
        makeEnvelope("env-1", [makeTx("tx-1", "TRANSFER_OUT", "tx-2")]),
        makeEnvelope("env-2", [makeTx("tx-2", "TRANSFER_IN", "tx-1")]),
      ],
    });
    expect(validatePayloadIntegrity(data)).toBeNull();
  });

  it("rejects a linkedTransactionId that references no transaction in the backup", () => {
    const data = makeBackup({
      envelopes: [makeEnvelope("env-1", [makeTx("tx-1", "TRANSFER_OUT", "missing-tx")])],
    });
    expect(validatePayloadIntegrity(data)).toMatch(/identifiant absent/);
  });

  it("rejects an asymmetric transfer pair (both TRANSFER_OUT)", () => {
    const data = makeBackup({
      envelopes: [
        makeEnvelope("env-1", [makeTx("tx-1", "TRANSFER_OUT", "tx-2")]),
        makeEnvelope("env-2", [makeTx("tx-2", "TRANSFER_OUT", "tx-1")]),
      ],
    });
    expect(validatePayloadIntegrity(data)).toMatch(/paires symétriques/);
  });

  // Regression: a corrupted or hand-edited backup could contain two rows
  // sharing an id. Before this fix, the duplicate was only caught mid-import
  // by a Prisma P2002 error, after some rows had already been written.
  it("rejects two envelopes sharing the same id", () => {
    const data = makeBackup({
      envelopes: [makeEnvelope("dup-id"), makeEnvelope("dup-id")],
    });
    expect(validatePayloadIntegrity(data)).toMatch(/identifiants sont dupliqués/);
  });

  it("rejects two transactions sharing the same id across different envelopes", () => {
    const data = makeBackup({
      envelopes: [
        makeEnvelope("env-1", [makeTx("dup-tx", "FILL")]),
        makeEnvelope("env-2", [makeTx("dup-tx", "SPEND")]),
      ],
    });
    expect(validatePayloadIntegrity(data)).toMatch(/identifiants sont dupliqués/);
  });

  it("rejects two recurring charges sharing the same id", () => {
    const data = makeBackup({
      recurringCharges: [
        { id: "dup-rc", name: "Loyer", amount: 900, dayOfMonth: 1, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "dup-rc", name: "Internet", amount: 40, dayOfMonth: 5, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(validatePayloadIntegrity(data)).toMatch(/identifiants sont dupliqués/);
  });

  it("rejects two treasury pools sharing the same id", () => {
    const data = makeBackup({
      treasury: {
        id: "treasury-1",
        balance: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        adjustments: [],
        pools: [
          { id: "dup-pool", name: "Épargne", availability: "SHORT", amount: 100, order: 0, createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "dup-pool", name: "Vacances", availability: "SHORT", amount: 50, order: 1, createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      },
    });
    expect(validatePayloadIntegrity(data)).toMatch(/identifiants sont dupliqués/);
  });

  it("accepts distinct ids across every entity array", () => {
    const data = makeBackup({
      envelopes: [makeEnvelope("env-1"), makeEnvelope("env-2")],
      recurringCharges: [
        { id: "rc-1", name: "Loyer", amount: 900, dayOfMonth: 1, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      treasury: {
        id: "treasury-1",
        balance: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        adjustments: [
          { id: "adj-1", amount: 50, type: "SET", label: null, createdAt: "2026-01-01T00:00:00.000Z" },
        ],
        pools: [
          { id: "pool-1", name: "Épargne", availability: "SHORT", amount: 100, order: 0, createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      },
    });
    expect(validatePayloadIntegrity(data)).toBeNull();
  });
});
