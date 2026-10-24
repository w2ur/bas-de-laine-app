import { describe, it, expect } from "vitest";
import { chargeSchema } from "./charge";

describe("chargeSchema", () => {
  it("accepts a valid charge", () => {
    const result = chargeSchema.safeParse({
      name: "Loyer",
      amount: 1200,
      dayOfMonth: 5,
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults active to true", () => {
    const result = chargeSchema.safeParse({
      name: "Internet",
      amount: 50,
      dayOfMonth: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.active).toBe(true);
    }
  });

  it("rejects empty name", () => {
    const result = chargeSchema.safeParse({
      name: "",
      amount: 100,
      dayOfMonth: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = chargeSchema.safeParse({
      name: "Test",
      amount: 0,
      dayOfMonth: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = chargeSchema.safeParse({
      name: "Test",
      amount: -50,
      dayOfMonth: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects dayOfMonth below 1", () => {
    const result = chargeSchema.safeParse({
      name: "Test",
      amount: 100,
      dayOfMonth: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects dayOfMonth above 31", () => {
    const result = chargeSchema.safeParse({
      name: "Test",
      amount: 100,
      dayOfMonth: 32,
    });
    expect(result.success).toBe(false);
  });

  it("accepts dayOfMonth boundaries (1 and 31)", () => {
    expect(
      chargeSchema.safeParse({ name: "A", amount: 10, dayOfMonth: 1 }).success
    ).toBe(true);
    expect(
      chargeSchema.safeParse({ name: "B", amount: 10, dayOfMonth: 31 }).success
    ).toBe(true);
  });

  it("coerces string values", () => {
    const result = chargeSchema.safeParse({
      name: "Internet",
      amount: "49.99",
      dayOfMonth: "15",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(49.99);
      expect(result.data.dayOfMonth).toBe(15);
    }
  });

  // Regression: findings 56 + 57 — monetary and text field bounds
  it("rejects Decimal(12,2)-overflowing amount", () => {
    const result = chargeSchema.safeParse({ name: "Test", amount: 10_000_000_000, dayOfMonth: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 characters", () => {
    const result = chargeSchema.safeParse({ name: "a".repeat(101), amount: 100, dayOfMonth: 1 });
    expect(result.success).toBe(false);
  });
});

// Regression: 4d1acde — chargeSchema only checked positive().max(), so
// amount=0.004 passed and Decimal(12,2) stored a 0,00 € recurring charge.
// It now shares the round-or-reject money rule (fa28d71, fillWeek's rule).
describe("chargeSchema — round to cents or reject", () => {
  it("rejects an amount that rounds to zero cents", () => {
    const r = chargeSchema.safeParse({ name: "Test", amount: 0.004, dayOfMonth: 1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Montant invalide");
  });

  it("rounds a sub-cent amount to cents", () => {
    const r = chargeSchema.safeParse({ name: "Test", amount: "49.996", dayOfMonth: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(50);
  });
});
