import { describe, it, expect } from "vitest";
import { computeEnvelopeBalance } from "./envelope-balance";

describe("computeEnvelopeBalance", () => {
  it("returns 0 for empty transactions", () => {
    expect(computeEnvelopeBalance([])).toBe(0);
  });

  it("adds FILL amounts", () => {
    const txs = [
      { amount: { toString: () => "100" }, type: "FILL" as const },
      { amount: { toString: () => "50" }, type: "FILL" as const },
    ];
    expect(computeEnvelopeBalance(txs)).toBe(150);
  });

  it("subtracts SPEND amounts", () => {
    const txs = [
      { amount: { toString: () => "100" }, type: "FILL" as const },
      { amount: { toString: () => "30" }, type: "SPEND" as const },
    ];
    expect(computeEnvelopeBalance(txs)).toBe(70);
  });

  it("adds TRANSFER_IN amounts", () => {
    const txs = [
      { amount: { toString: () => "100" }, type: "FILL" as const },
      { amount: { toString: () => "50" }, type: "TRANSFER_IN" as const },
    ];
    expect(computeEnvelopeBalance(txs)).toBe(150);
  });

  it("subtracts TRANSFER_OUT amounts", () => {
    const txs = [
      { amount: { toString: () => "200" }, type: "FILL" as const },
      { amount: { toString: () => "75" }, type: "TRANSFER_OUT" as const },
    ];
    expect(computeEnvelopeBalance(txs)).toBe(125);
  });

  it("handles all four types together", () => {
    const txs = [
      { amount: { toString: () => "500" }, type: "FILL" as const },
      { amount: { toString: () => "100" }, type: "SPEND" as const },
      { amount: { toString: () => "50" }, type: "TRANSFER_IN" as const },
      { amount: { toString: () => "200" }, type: "TRANSFER_OUT" as const },
    ];
    expect(computeEnvelopeBalance(txs)).toBe(250);
  });

  it("can return negative balance", () => {
    const txs = [
      { amount: { toString: () => "50" }, type: "FILL" as const },
      { amount: { toString: () => "100" }, type: "SPEND" as const },
    ];
    expect(computeEnvelopeBalance(txs)).toBe(-50);
  });
});
