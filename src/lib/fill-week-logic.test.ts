import { describe, it, expect } from "vitest";
import {
  validateFillWeekTarget,
  fillWeekDateRejection,
  findForeignOrInvalidEnvelope,
  roundFillAmountsOrReject,
  partitionFillsByExpectedState,
} from "./fill-week-logic";
import { getFinancialMonthBounds } from "./format";

const bounds = { start: new Date(Date.UTC(2026, 8, 7)), end: new Date(Date.UTC(2026, 9, 4, 23, 59, 59, 999)) };
const today = new Date(Date.UTC(2026, 8, 22));
const currentMonday = new Date(Date.UTC(2026, 8, 21));

describe("validateFillWeekTarget", () => {
  it("accepts a Monday inside the month, not after today", () => {
    expect(
      validateFillWeekTarget({ date: new Date(Date.UTC(2026, 8, 21)), today, monthBounds: bounds, currentMonday })
    ).toBeNull();
  });
  it("rejects a date in the future", () => {
    expect(
      validateFillWeekTarget({ date: new Date(Date.UTC(2026, 8, 28)), today, monthBounds: bounds, currentMonday })
    ).toBe("La date ne peut pas être dans le futur");
  });
  it("rejects a date outside the current financial month", () => {
    expect(
      validateFillWeekTarget({ date: new Date(Date.UTC(2026, 7, 31)), today, monthBounds: bounds, currentMonday })
    ).toBe("La date doit être dans le mois en cours");
  });

  // Regression: production feeds getFinancialMonthBounds() output, whose
  // `start`/`end` are LOCAL midnight / local end-of-day — not the UTC-midnight
  // `Date.UTC(...)` bounds used above. A UTC-midnight calendar date must still
  // compare correctly against those local bounds (see the invariant comment
  // on validateFillWeekTarget). currentMonday is set to the date under test so
  // this case isolates the bounds check from the current-Monday check below.
  it("accepts the first Monday against real (local) getFinancialMonthBounds output", () => {
    const realBounds = getFinancialMonthBounds(new Date(2026, 8, 1));
    const realToday = new Date("2026-09-22");
    expect(
      validateFillWeekTarget({
        date: new Date("2026-09-07"),
        today: realToday,
        monthBounds: realBounds,
        currentMonday: new Date("2026-09-07"),
      })
    ).toBeNull();
  });

  it("rejects the Sunday just before the first Monday against real bounds", () => {
    const realBounds = getFinancialMonthBounds(new Date(2026, 8, 1));
    const realToday = new Date("2026-09-22");
    expect(
      validateFillWeekTarget({
        date: new Date("2026-09-06"),
        today: realToday,
        monthBounds: realBounds,
        currentMonday: new Date("2026-09-07"),
      })
    ).toBe("La date doit être dans le mois en cours");
  });

  // Defense in depth: the client is expected to submit the server-derived
  // Monday, but validateFillWeekTarget must reject any other weekday itself.
  it("accepts a Monday that clears the future and month-bounds checks", () => {
    const realBounds = getFinancialMonthBounds(new Date(2026, 8, 1));
    expect(
      validateFillWeekTarget({
        date: new Date("2026-09-21"),
        today: new Date("2026-09-21"),
        monthBounds: realBounds,
        currentMonday: new Date("2026-09-21"),
      })
    ).toBeNull();
  });

  it("rejects a non-Monday even when it clears the future and month-bounds checks", () => {
    const realBounds = getFinancialMonthBounds(new Date(2026, 8, 1));
    expect(
      validateFillWeekTarget({
        date: new Date("2026-09-22"),
        today: new Date("2026-09-22"),
        monthBounds: realBounds,
        currentMonday: new Date("2026-09-21"),
      })
    ).toBe("La date doit être un lundi");
  });

  // Regression: bc23cfb (related case) — any past Monday of
  // the current financial month used to be accepted, not only the current
  // week's Monday. A sheet opened Sunday and confirmed after midnight could
  // date its fills the previous (possibly already-filled) week, leaving the
  // actual current week still showing as unfilled.
  it("rejects a past Monday that is not the current week's Monday", () => {
    const realBounds = getFinancialMonthBounds(new Date(2026, 8, 1));
    expect(
      validateFillWeekTarget({
        date: new Date("2026-09-07"),
        today: new Date("2026-09-22"),
        monthBounds: realBounds,
        currentMonday: new Date("2026-09-21"),
      })
    ).toBe("La date doit être le lundi de la semaine en cours");
  });
});

describe("roundFillAmountsOrReject", () => {
  it("rounds every amount to cents", () => {
    const result = roundFillAmountsOrReject([{ envelopeId: "a", amount: 10.004 }]);
    expect(result).toEqual({ fills: [{ envelopeId: "a", amount: 10 }] });
  });

  // Regression: ed2bb16 — fillWeekSchema has no cent-precision
  // check (positive().max(...) only), so a caller other than the sheet could
  // post a sub-cent amount that Postgres stores as-is. Before this guard,
  // 0.001 rounded away to a 0.00 FILL, silently breaking the schema's own
  // "amount must be positive" rule. The contract says stored results always
  // go through roundToCents; this makes rounding-to-zero a rejection instead
  // of a silently written zero-amount row.
  it("rejects a batch where rounding collapses an amount to zero", () => {
    expect(roundFillAmountsOrReject([{ envelopeId: "a", amount: 0.001 }])).toEqual({
      error: "Montant invalide",
    });
  });

  it("rejects the whole batch if any single fill rounds to zero", () => {
    const result = roundFillAmountsOrReject([
      { envelopeId: "a", amount: 50 },
      { envelopeId: "b", amount: 0.001 },
    ]);
    expect(result).toEqual({ error: "Montant invalide" });
  });
});

describe("partitionFillsByExpectedState", () => {
  const week = { monday: new Date(2026, 8, 21), sunday: new Date(2026, 8, 27, 23, 59, 59, 999) };
  const monthBounds = getFinancialMonthBounds(new Date(2026, 8, 1));
  const cadenceById = new Map<string, "WEEKLY" | "MONTHLY">([
    ["w", "WEEKLY"],
    ["m", "MONTHLY"],
  ]);

  // Regression: 7492dbc (Important) — the previous guard
  // (findAlreadyFilledEnvelopeIds) dropped *every* envelope with any FILL in
  // its window, so a top-up (a partial fill plus its remainder, which
  // filterPendingFillRows/F3 makes reachable) could never be written: the
  // action returned {} and the client toasted "Semaine remplie" while
  // silently discarding the write. The idempotency key is now "the state
  // the client saw" (expectedFilledAmount) instead of a boolean presence
  // check, so a genuine top-up (current sum still matches what the client
  // saw) is written, and only a stale resubmission (current sum has since
  // changed) is dropped.
  it("writes a fresh fill when nothing exists yet and none was expected", () => {
    const result = partitionFillsByExpectedState(
      [{ envelopeId: "w", amount: 138.46, expectedFilledAmount: 0 }],
      cadenceById,
      new Map(),
      week,
      monthBounds
    );
    expect(result).toEqual({ toInsert: [{ envelopeId: "w", amount: 138.46 }], droppedCount: 0 });
  });

  it("writes a top-up when the current sum still matches what the client expected", () => {
    const existing = new Map([["w", [{ date: new Date(2026, 8, 22), amount: 20 }]]]);
    const result = partitionFillsByExpectedState(
      [{ envelopeId: "w", amount: 118.46, expectedFilledAmount: 20 }],
      cadenceById,
      existing,
      week,
      monthBounds
    );
    expect(result).toEqual({ toInsert: [{ envelopeId: "w", amount: 118.46 }], droppedCount: 0 });
  });

  it("drops a stale resubmission whose expected state no longer matches", () => {
    // The client expected 0 (never filled), but a concurrent request already filled it.
    const existing = new Map([["w", [{ date: new Date(2026, 8, 22), amount: 138.46 }]]]);
    const result = partitionFillsByExpectedState(
      [{ envelopeId: "w", amount: 138.46, expectedFilledAmount: 0 }],
      cadenceById,
      existing,
      week,
      monthBounds
    );
    expect(result).toEqual({ toInsert: [], droppedCount: 1 });
  });

  it("only sums existing fills inside the envelope's own cadence window", () => {
    const existing = new Map([["w", [{ date: new Date(2026, 8, 10), amount: 50 }]]]); // last week
    const result = partitionFillsByExpectedState(
      [{ envelopeId: "w", amount: 138.46, expectedFilledAmount: 0 }],
      cadenceById,
      existing,
      week,
      monthBounds
    );
    expect(result).toEqual({ toInsert: [{ envelopeId: "w", amount: 138.46 }], droppedCount: 0 });
  });

  it("sums a MONTHLY envelope's fills across the whole financial month", () => {
    const existing = new Map([["m", [{ date: new Date(2026, 8, 8), amount: 100 }]]]);
    const result = partitionFillsByExpectedState(
      [{ envelopeId: "m", amount: 453.84, expectedFilledAmount: 100 }],
      cadenceById,
      existing,
      week,
      monthBounds
    );
    expect(result).toEqual({ toInsert: [{ envelopeId: "m", amount: 453.84 }], droppedCount: 0 });
  });

  it("mixes a written fresh fill and a dropped stale one in the same batch", () => {
    const existing = new Map([["w", [{ date: new Date(2026, 8, 22), amount: 138.46 }]]]);
    const result = partitionFillsByExpectedState(
      [
        { envelopeId: "w", amount: 138.46, expectedFilledAmount: 0 }, // stale
        { envelopeId: "m", amount: 553.84, expectedFilledAmount: 0 }, // fresh
      ],
      cadenceById,
      existing,
      week,
      monthBounds
    );
    expect(result).toEqual({ toInsert: [{ envelopeId: "m", amount: 553.84 }], droppedCount: 1 });
  });
});

describe("findForeignOrInvalidEnvelope", () => {
  const owned = [
    { id: "a", type: "BUDGET" as const, isArchived: false },
    { id: "g", type: "GOAL" as const, isArchived: false },
    { id: "z", type: "BUDGET" as const, isArchived: true },
  ];
  it("returns null when every fill targets an active BUDGET envelope of the household", () => {
    expect(findForeignOrInvalidEnvelope([{ envelopeId: "a" }], owned)).toBeNull();
  });
  it("returns the id of an envelope the household does not own", () => {
    expect(findForeignOrInvalidEnvelope([{ envelopeId: "a" }, { envelopeId: "x" }], owned)).toBe("x");
  });
  it("returns the id of a GOAL envelope", () => {
    expect(findForeignOrInvalidEnvelope([{ envelopeId: "g" }], owned)).toBe("g");
  });
  it("returns the id of an archived envelope", () => {
    expect(findForeignOrInvalidEnvelope([{ envelopeId: "z" }], owned)).toBe("z");
  });
});

// Regression: ca44d67 — a sheet left open from last week (a PWA
// resumed from the background, or opened Sunday 23:58 and confirmed Monday
// 00:01) submitted last week's Monday, the server rejected it, and the sheet
// only toasted: reopening showed the same stale plan and the same error
// every time. A date/week rejection is now marked stale so the sheet closes
// and refreshes the plan.
describe("fillWeekDateRejection", () => {
  it("marks last week's Monday as a stale plan", () => {
    const lastMonday = new Date(Date.UTC(2026, 8, 14));
    expect(fillWeekDateRejection({ date: lastMonday, today, monthBounds: bounds, currentMonday })).toEqual({
      error: "La date doit être le lundi de la semaine en cours",
      stale: true,
    });
  });

  it("marks a Monday from last financial month as a stale plan", () => {
    const previousMonthMonday = new Date(Date.UTC(2026, 7, 31));
    expect(fillWeekDateRejection({ date: previousMonthMonday, today, monthBounds: bounds, currentMonday })).toEqual({
      error: "La date doit être dans le mois en cours",
      stale: true,
    });
  });

  it("lets the current week's Monday through", () => {
    expect(fillWeekDateRejection({ date: currentMonday, today, monthBounds: bounds, currentMonday })).toBeNull();
  });
});
