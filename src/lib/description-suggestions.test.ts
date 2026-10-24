import { describe, it, expect } from "vitest";
import { rankDescriptions } from "./description-suggestions";

function rows(entries: [string, string][]) {
  return entries.map(([envelopeId, description]) => ({ envelopeId, description }));
}

describe("rankDescriptions", () => {
  it("groups descriptions per envelope ignoring case and surrounding whitespace", () => {
    const result = rankDescriptions(
      rows([
        ["env-1", "Intermarché"],
        ["env-1", "intermarché "],
        ["env-1", " INTERMARCHÉ"],
      ])
    );
    expect(result["env-1"]).toEqual(["Intermarché"]);
  });

  it("dedupes differently-spaced descriptions into a single suggestion, collapsing the displayed spelling too", () => {
    const result = rankDescriptions(
      rows([
        ["env-1", "Boulangerie   du   coin"],
        ["env-1", "Boulangerie du coin"],
      ])
    );
    expect(result["env-1"]).toEqual(["Boulangerie du coin"]);
  });

  it("displays the most frequent original spelling for a normalised key", () => {
    const result = rankDescriptions(
      rows([
        ["env-1", "Intermarché "],
        ["env-1", "Intermarché "],
        ["env-1", "Intermarché"],
      ])
    );
    expect(result["env-1"]).toEqual(["Intermarché"]);
  });

  it("ranks by frequency, most-used description first", () => {
    const result = rankDescriptions(
      rows([
        ["env-1", "Monoprix"],
        ["env-1", "Boulangerie"],
        ["env-1", "Boulangerie"],
        ["env-1", "Boulangerie"],
      ])
    );
    expect(result["env-1"]).toEqual(["Boulangerie", "Monoprix"]);
  });

  it("breaks frequency ties by recency (earlier index = more recent)", () => {
    // Rows are expected ordered most-recent-first.
    const result = rankDescriptions(
      rows([
        ["env-1", "Monoprix"], // most recent, count 1
        ["env-1", "Boulangerie"], // count 1, older
      ])
    );
    expect(result["env-1"]).toEqual(["Monoprix", "Boulangerie"]);
  });

  it("limits suggestions to the top 8 per envelope", () => {
    const descriptions: [string, string][] = Array.from({ length: 10 }, (_, i) => [
      "env-1",
      `Marchand ${i}`,
    ]);
    const result = rankDescriptions(rows(descriptions));
    expect(result["env-1"]).toHaveLength(8);
  });

  it("keeps envelopes independent", () => {
    const result = rankDescriptions(
      rows([
        ["env-1", "Intermarché"],
        ["env-2", "Boulangerie"],
      ])
    );
    expect(result["env-1"]).toEqual(["Intermarché"]);
    expect(result["env-2"]).toEqual(["Boulangerie"]);
  });

  it("skips descriptions that are empty or whitespace-only after trimming", () => {
    const result = rankDescriptions(rows([["env-1", "   "], ["env-1", ""]]));
    expect(result).toEqual({});
  });

  it("returns an empty result when given no rows", () => {
    const result = rankDescriptions([]);
    expect(result).toEqual({});
  });
});
