import { describe, it, expect } from "vitest";
import { pickDefaultEnvelope } from "./quick-spend-logic";

const envelopes = [
  { id: "groceries", type: "BUDGET" as const },
  { id: "holiday", type: "GOAL" as const },
];

describe("pickDefaultEnvelope", () => {
  it("keeps the envelope the sheet was opened from", () => {
    expect(pickDefaultEnvelope("holiday", "groceries", envelopes, "FILL")).toBe("holiday");
  });

  it("falls back to the last envelope spent from on this device", () => {
    expect(pickDefaultEnvelope(null, "groceries", envelopes, "SPEND")).toBe("groceries");
  });

  it("ignores a stored envelope that is no longer listed", () => {
    expect(pickDefaultEnvelope(null, "archived-one", envelopes, "SPEND")).toBeNull();
  });

  it("ignores a stored goal when spending, but not when filling", () => {
    expect(pickDefaultEnvelope(null, "holiday", envelopes, "SPEND")).toBeNull();
    expect(pickDefaultEnvelope(null, "holiday", envelopes, "FILL")).toBe("holiday");
  });

  it("picks nothing with no opener and nothing stored", () => {
    expect(pickDefaultEnvelope(null, null, envelopes, "SPEND")).toBeNull();
  });
});
