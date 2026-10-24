import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { activeChargesTotal, chargeRow, envelopeManagerRow, goalManagerRow } from "./settings-rows";

const base = { id: "e1", name: "Courses", icon: null, color: null, isArchived: false };

// Regression: 7b213bc — the configuration pages handed raw Prisma rows, Decimal
// amounts included, to client components; React refuses a Decimal across that
// boundary and logged an error on every load.
describe("settings rows carry plain numbers, never a Decimal", () => {
  it("envelope budget", () => {
    const row = envelopeManagerRow({ ...base, monthlyBudget: new Prisma.Decimal("110.76"), fillCadence: "MONTHLY" });
    expect(row.monthlyBudget).toBe(110.76);
    expect(typeof row.monthlyBudget).toBe("number");
  });

  it("goal target, and a missing one stays null", () => {
    expect(goalManagerRow({ ...base, targetAmount: new Prisma.Decimal("2000"), targetDate: null }).targetAmount).toBe(2000);
    expect(goalManagerRow({ ...base, targetAmount: null, targetDate: null }).targetAmount).toBeNull();
  });

  it("charge amount", () => {
    const row = chargeRow({ id: "c1", name: "Loyer", amount: new Prisma.Decimal("850.50"), dayOfMonth: 5, active: true });
    expect(row.amount).toBe(850.5);
  });

  it("sends only the declared fields", () => {
    const withExtras = { ...base, monthlyBudget: null, fillCadence: "WEEKLY" as const, householdId: "h", createdAt: new Date() };
    expect(Object.keys(envelopeManagerRow(withExtras)).sort()).toEqual(
      ["color", "fillCadence", "icon", "id", "isArchived", "monthlyBudget", "name"],
    );
  });
});

describe("activeChargesTotal", () => {
  it("sums active charges only", () => {
    expect(
      activeChargesTotal([
        { amount: new Prisma.Decimal("10.10"), active: true },
        { amount: new Prisma.Decimal("99"), active: false },
        { amount: new Prisma.Decimal("5.05"), active: true },
      ]),
    ).toBeCloseTo(15.15, 6);
  });
});
