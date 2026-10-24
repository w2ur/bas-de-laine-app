import { describe, it, expect } from "vitest";
import {
  treasurySetSchema,
  treasuryDeductSchema,
  treasuryPoolCreateSchema,
  treasuryPoolUpdateSchema,
} from "./treasury";

describe("treasurySetSchema", () => {
  it("accepts valid balance", () => {
    const result = treasurySetSchema.safeParse({ balance: 1000 });
    expect(result.success).toBe(true);
  });

  it("accepts zero balance", () => {
    const result = treasurySetSchema.safeParse({ balance: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts balance with label", () => {
    const result = treasurySetSchema.safeParse({
      balance: 500,
      label: "Mise à jour mensuelle",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative balance", () => {
    const result = treasurySetSchema.safeParse({ balance: -100 });
    expect(result.success).toBe(false);
  });

  it("coerces string to number", () => {
    const result = treasurySetSchema.safeParse({ balance: "750" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.balance).toBe(750);
    }
  });

  // MoneyInput submits a dot-decimal string (e.g. "9.95")
  it("coerces a dot-decimal string from MoneyInput", () => {
    const result = treasurySetSchema.safeParse({ balance: "9.95" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.balance).toBe(9.95);
    }
  });
});

describe("treasuryDeductSchema", () => {
  it("accepts valid deduction", () => {
    const result = treasuryDeductSchema.safeParse({
      amount: 200,
      label: "Achat exceptionnel",
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero amount", () => {
    const result = treasuryDeductSchema.safeParse({
      amount: 0,
      label: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = treasuryDeductSchema.safeParse({
      amount: -50,
      label: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty label", () => {
    const result = treasuryDeductSchema.safeParse({
      amount: 100,
      label: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing label", () => {
    const result = treasuryDeductSchema.safeParse({ amount: 100 });
    expect(result.success).toBe(false);
  });

  // MoneyInput submits a dot-decimal string (e.g. "9.95")
  it("coerces a dot-decimal string from MoneyInput", () => {
    const result = treasuryDeductSchema.safeParse({ amount: "9.95", label: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(9.95);
    }
  });
});

describe("treasuryPoolCreateSchema", () => {
  it("accepts valid pool", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "Compte courant",
      availability: "IMMEDIATE",
      amount: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero amount", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "Nouveau compte",
      availability: "SHORT",
      amount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "",
      availability: "IMMEDIATE",
      amount: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "Test",
      availability: "LONG",
      amount: -500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid availability", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "Test",
      availability: "UNKNOWN",
      amount: 100,
    });
    expect(result.success).toBe(false);
  });

  it("coerces string amount", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "Livret A",
      availability: "SHORT",
      amount: "12000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(12000);
    }
  });

  // MoneyInput submits a dot-decimal string (e.g. "9.95")
  it("coerces a dot-decimal string from MoneyInput", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "Livret A",
      availability: "SHORT",
      amount: "9.95",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(9.95);
    }
  });
});

describe("treasuryPoolUpdateSchema", () => {
  it("accepts full update", () => {
    const result = treasuryPoolUpdateSchema.safeParse({
      id: "abc123",
      name: "Livret A",
      availability: "SHORT",
      amount: 15000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = treasuryPoolUpdateSchema.safeParse({
      name: "Livret A",
      availability: "SHORT",
      amount: 15000,
    });
    expect(result.success).toBe(false);
  });
});

// Regression: findings 56 + 57 — monetary and text field bounds
describe("treasury schemas — monetary and text bounds", () => {
  it("rejects Decimal(12,2)-overflowing balance in treasurySetSchema", () => {
    const result = treasurySetSchema.safeParse({ balance: 10_000_000_000 });
    expect(result.success).toBe(false);
  });

  it("rejects Decimal(12,2)-overflowing amount in treasuryDeductSchema", () => {
    const result = treasuryDeductSchema.safeParse({ amount: 10_000_000_000, label: "Test" });
    expect(result.success).toBe(false);
  });

  it("rejects Decimal(12,2)-overflowing amount in treasuryPoolCreateSchema", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "Test",
      availability: "IMMEDIATE",
      amount: 10_000_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects pool name longer than 100 characters", () => {
    const result = treasuryPoolCreateSchema.safeParse({
      name: "a".repeat(101),
      availability: "IMMEDIATE",
      amount: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects label longer than 500 characters in treasuryDeductSchema", () => {
    const result = treasuryDeductSchema.safeParse({
      amount: 100,
      label: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// Regression: 4d1acde — treasuryDeductSchema only checked
// positive().max(), so amount=0.004 passed and stored a 0,00 € treasury
// adjustment. It now shares the round-or-reject money rule.
describe("treasuryDeductSchema — round to cents or reject", () => {
  it("rejects an amount that rounds to zero cents", () => {
    const r = treasuryDeductSchema.safeParse({ amount: 0.004, label: "Test" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Montant invalide");
  });

  it("rounds a sub-cent amount to cents", () => {
    const r = treasuryDeductSchema.safeParse({ amount: 12.344, label: "Test" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(12.34);
  });
});
