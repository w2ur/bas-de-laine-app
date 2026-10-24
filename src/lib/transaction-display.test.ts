import { describe, it, expect } from "vitest";
import { transactionDisplay } from "./transaction-display";

describe("transactionDisplay", () => {
  it("reads money leaving an envelope as out, with a minus", () => {
    expect(transactionDisplay("SPEND")).toMatchObject({ sign: "-", direction: "out" });
    expect(transactionDisplay("TRANSFER_OUT")).toMatchObject({ sign: "-", direction: "out" });
  });

  it("reads money entering an envelope as in, with a plus", () => {
    expect(transactionDisplay("FILL")).toMatchObject({ sign: "+", direction: "in" });
    expect(transactionDisplay("TRANSFER_IN")).toMatchObject({ sign: "+", direction: "in" });
  });

  it("names each kind distinctly for the row's sheet", () => {
    const kinds = (["SPEND", "TRANSFER_OUT", "FILL", "TRANSFER_IN"] as const).map((t) => transactionDisplay(t).kind);
    expect(new Set(kinds).size).toBe(4);
  });
});
