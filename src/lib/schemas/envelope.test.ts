import { describe, it, expect } from "vitest";
import { envelopeSchema, envelopeTransactionSchema, goalEnvelopeSchema, transferSchema, fillWeekSchema } from "./envelope";

describe("envelopeSchema", () => {
  it("accepts valid envelope data", () => {
    const result = envelopeSchema.safeParse({
      name: "Courses",
      monthlyBudget: 500,
    });
    expect(result.success).toBe(true);
  });

  it("accepts envelope with optional fields", () => {
    const result = envelopeSchema.safeParse({
      name: "Loisirs",
      monthlyBudget: 200,
      icon: "🎉",
      color: "#f59e0b",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = envelopeSchema.safeParse({
      name: "",
      monthlyBudget: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative monthly budget", () => {
    const result = envelopeSchema.safeParse({
      name: "Test",
      monthlyBudget: -10,
    });
    expect(result.success).toBe(false);
  });

  it("accepts zero monthly budget", () => {
    const result = envelopeSchema.safeParse({
      name: "Test",
      monthlyBudget: 0,
    });
    expect(result.success).toBe(true);
  });

  it("coerces string budget to number", () => {
    const result = envelopeSchema.safeParse({
      name: "Test",
      monthlyBudget: "300",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.monthlyBudget).toBe(300);
    }
  });

  // MoneyInput submits a dot-decimal string (e.g. "9.95")
  it("coerces a dot-decimal string from MoneyInput", () => {
    const result = envelopeSchema.safeParse({ name: "Test", monthlyBudget: "9.95" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.monthlyBudget).toBe(9.95);
    }
  });

  it("defaults fillCadence to WEEKLY when absent", () => {
    const result = envelopeSchema.safeParse({ name: "Courses", monthlyBudget: "600" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fillCadence).toBe("WEEKLY");
  });

  it("accepts MONTHLY", () => {
    const result = envelopeSchema.safeParse({ name: "Café", monthlyBudget: "40", fillCadence: "MONTHLY" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fillCadence).toBe("MONTHLY");
  });

  it("rejects an unknown cadence with a French message", () => {
    const result = envelopeSchema.safeParse({ name: "Café", monthlyBudget: "40", fillCadence: "DAILY" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Cadence de remplissage invalide");
  });
});

describe("envelopeTransactionSchema", () => {
  it("accepts a valid FILL transaction", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 50,
      type: "FILL",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid SPEND transaction", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 25.50,
      type: "SPEND",
      description: "Supermarché",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a transaction with a calendar date (yyyy-MM-dd)", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10,
      type: "SPEND",
      date: "2026-06-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBeInstanceOf(Date);
      // "2026-06-01" parses as UTC midnight — year 2026, month June (5), day 1
      expect(result.data.date!.getUTCFullYear()).toBe(2026);
      expect(result.data.date!.getUTCMonth()).toBe(5); // June = 5
      expect(result.data.date!.getUTCDate()).toBe(1);
    }
  });

  // Regression: finding 3 — a full ISO timestamp must be rejected to prevent TZ shift
  it("rejects a full ISO timestamp (yyyy-MM-ddTHH:mm:ss.sssZ)", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10,
      type: "SPEND",
      date: "2026-06-01T15:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a garbage date string", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10,
      type: "SPEND",
      date: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 0,
      type: "FILL",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: -10,
      type: "SPEND",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10,
      type: "TRANSFER",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty envelopeId", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "",
      amount: 10,
      type: "FILL",
    });
    expect(result.success).toBe(false);
  });

  it("coerces string amount to number", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: "42.50",
      type: "FILL",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(42.5);
    }
  });
});

describe("goalEnvelopeSchema", () => {
  it("accepts valid goal envelope data", () => {
    const result = goalEnvelopeSchema.safeParse({ name: "Casque audio", targetAmount: 300 });
    expect(result.success).toBe(true);
  });

  it("accepts goal with optional fields", () => {
    const result = goalEnvelopeSchema.safeParse({
      name: "Cadeau", targetAmount: 100, targetDate: "2026-06-15", icon: "🎁", color: "#a855f7",
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero target amount", () => {
    const result = goalEnvelopeSchema.safeParse({ name: "Test", targetAmount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative target amount", () => {
    const result = goalEnvelopeSchema.safeParse({ name: "Test", targetAmount: -50 });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = goalEnvelopeSchema.safeParse({ name: "", targetAmount: 100 });
    expect(result.success).toBe(false);
  });

  // MoneyInput submits a dot-decimal string (e.g. "9.95")
  it("coerces a dot-decimal string from MoneyInput", () => {
    const result = goalEnvelopeSchema.safeParse({ name: "Test", targetAmount: "9.95" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetAmount).toBe(9.95);
    }
  });
});

describe("transferSchema", () => {
  it("accepts valid transfer data", () => {
    const result = transferSchema.safeParse({ sourceId: "abc-123", destinationId: "def-456", amount: 50 });
    expect(result.success).toBe(true);
  });

  it("accepts transfer with optional fields", () => {
    const result = transferSchema.safeParse({
      sourceId: "abc-123", destinationId: "def-456", amount: 100,
      description: "Transfert vers extras", date: "2026-03-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero amount", () => {
    const result = transferSchema.safeParse({ sourceId: "abc-123", destinationId: "def-456", amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects missing sourceId", () => {
    const result = transferSchema.safeParse({ sourceId: "", destinationId: "def-456", amount: 50 });
    expect(result.success).toBe(false);
  });

  it("rejects missing destinationId", () => {
    const result = transferSchema.safeParse({ sourceId: "abc-123", destinationId: "", amount: 50 });
    expect(result.success).toBe(false);
  });

  // MoneyInput submits a dot-decimal string (e.g. "9.95")
  it("coerces a dot-decimal string from MoneyInput", () => {
    const result = transferSchema.safeParse({ sourceId: "abc-123", destinationId: "def-456", amount: "9.95" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(9.95);
    }
  });

  // Regression: finding 3 — transfer date must reject ISO timestamps
  it("rejects a full ISO timestamp for transfer date", () => {
    const result = transferSchema.safeParse({
      sourceId: "abc-123",
      destinationId: "def-456",
      amount: 50,
      date: "2026-06-01T15:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

// Regression: findings 56 + 57 — monetary and text field bounds
describe("envelope schemas — monetary and text bounds", () => {
  it("rejects Decimal(12,2)-overflowing monthlyBudget", () => {
    const result = envelopeSchema.safeParse({ name: "Test", monthlyBudget: 10_000_000_000 });
    expect(result.success).toBe(false);
  });

  it("rejects overflowing targetAmount in goalEnvelopeSchema", () => {
    const result = goalEnvelopeSchema.safeParse({ name: "Test", targetAmount: 10_000_000_000 });
    expect(result.success).toBe(false);
  });

  it("rejects overflowing amount in envelopeTransactionSchema", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10_000_000_000,
      type: "FILL",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overflowing amount in transferSchema", () => {
    const result = transferSchema.safeParse({
      sourceId: "abc-123",
      destinationId: "def-456",
      amount: 10_000_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 characters", () => {
    const result = envelopeSchema.safeParse({ name: "a".repeat(101), monthlyBudget: 100 });
    expect(result.success).toBe(false);
  });

  it("accepts name exactly 100 characters", () => {
    const result = envelopeSchema.safeParse({ name: "a".repeat(100), monthlyBudget: 100 });
    expect(result.success).toBe(true);
  });

  it("rejects description longer than 500 characters in transaction", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10,
      type: "SPEND",
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts description exactly 500 characters in transaction", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10,
      type: "SPEND",
      description: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  // Regression: task 9 — descriptions must be trimmed at write time so history
  // never accumulates trailing-space spelling variants of the same merchant.
  it("trims leading and trailing whitespace from a transaction description", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10,
      type: "SPEND",
      description: "  Intermarché  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Intermarché");
    }
  });

  it("trims leading and trailing whitespace from a transfer description", () => {
    const result = transferSchema.safeParse({
      sourceId: "abc-123",
      destinationId: "def-456",
      amount: 10,
      description: "  Loyer  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Loyer");
    }
  });

  // Regression: internal double (or more) spaces must collapse to one so
  // history never accumulates spacing variants of the same merchant.
  it("collapses internal double spaces in a transaction description", () => {
    const result = envelopeTransactionSchema.safeParse({
      envelopeId: "abc-123",
      amount: 10,
      type: "SPEND",
      description: "Super   U  Drive",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Super U Drive");
    }
  });

  it("collapses internal double spaces in a transfer description", () => {
    const result = transferSchema.safeParse({
      sourceId: "abc-123",
      destinationId: "def-456",
      amount: 10,
      description: "Virement  loyer   septembre",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Virement loyer septembre");
    }
  });
});

describe("fillWeekSchema", () => {
  const valid = { date: "2026-09-21", fills: [{ envelopeId: "a", amount: 138.46 }] };

  it("accepts a valid payload and parses the date as UTC midnight", () => {
    const r = fillWeekSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.date.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("rejects an empty fills list", () => {
    const r = fillWeekSchema.safeParse({ ...valid, fills: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Aucune enveloppe à remplir");
  });

  it("rejects duplicate envelopes", () => {
    const r = fillWeekSchema.safeParse({ ...valid, fills: [valid.fills[0], valid.fills[0]] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Une enveloppe apparaît deux fois");
  });

  it("rejects a zero amount", () => {
    const r = fillWeekSchema.safeParse({ ...valid, fills: [{ ...valid.fills[0], amount: 0 }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Le montant doit être positif");
  });

  // Regression: fills come from a typed object (not FormData), so amount must
  // stay a strict number — coercion would silently accept a stray string.
  it("rejects a string amount", () => {
    const r = fillWeekSchema.safeParse({ ...valid, fills: [{ ...valid.fills[0], amount: "7" }] });
    expect(r.success).toBe(false);
  });

  it("rejects more than 50 fills", () => {
    const fills = Array.from({ length: 51 }, (_, i) => ({ envelopeId: `e${i}`, amount: 1 }));
    const r = fillWeekSchema.safeParse({ ...valid, fills });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Trop d'enveloppes à remplir");
  });
});

// Regression: fa28d71 — envelopeTransactionSchema and transferSchema
// only checked positive().max(), so a sub-cent amount (0.004) passed the
// schema and Decimal(12,2) stored a 0,00 € GOAL/BUDGET FILL, SPEND or
// TRANSFER_OUT/IN pair: the defect ed2bb16 fixed for fillWeek only. Both
// schemas now round to cents and reject an amount that rounds to zero.
describe("envelope money schemas — round to cents or reject", () => {
  it.each(["FILL", "SPEND"] as const)("rejects an amount that rounds to zero cents (%s)", (type) => {
    const r = envelopeTransactionSchema.safeParse({ envelopeId: "abc-123", amount: 0.004, type });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Montant invalide");
  });

  it("rejects a transfer amount that rounds to zero cents", () => {
    const r = transferSchema.safeParse({ sourceId: "abc-123", destinationId: "def-456", amount: 0.004 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Montant invalide");
  });

  it("rounds a sub-cent envelope transaction amount to cents", () => {
    const r = envelopeTransactionSchema.safeParse({ envelopeId: "abc-123", amount: "25.456", type: "FILL" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(25.46);
  });

  it("rounds a sub-cent transfer amount to cents", () => {
    const r = transferSchema.safeParse({ sourceId: "abc-123", destinationId: "def-456", amount: 10.004 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(10);
  });
});

// Regression: 4d1acde — goalEnvelopeSchema.targetAmount only checked
// positive().max(), so targetAmount=0.004 stored a 0,00 € target, after
// which runGoalFillWrite refused every deposit to that goal. A goal target
// that is zero, or rounds to zero, is now impossible.
describe("goalEnvelopeSchema — target rounds to cents or is rejected", () => {
  it("rejects a target that rounds to zero cents", () => {
    const r = goalEnvelopeSchema.safeParse({ name: "Test", targetAmount: 0.004 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Montant invalide");
  });

  it("still rejects a zero target with the goal's own message", () => {
    const r = goalEnvelopeSchema.safeParse({ name: "Test", targetAmount: 0 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("L'objectif doit être positif");
  });

  it("rounds a sub-cent target to cents", () => {
    const r = goalEnvelopeSchema.safeParse({ name: "Test", targetAmount: "300.004" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.targetAmount).toBe(300);
  });
});
