import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { rankDescriptions } from "./description-suggestions";

const arbEnvelopeId = fc.constantFrom("env-1", "env-2", "env-3");
// ASCII-only charset: avoids Unicode case-folding edge cases (e.g. German ß,
// Turkish dotless i) that could break the whitespace/case-noise invariant
// below for reasons unrelated to rankDescriptions itself.
const arbDescription = fc
  .string({ minLength: 1, maxLength: 30, unit: "grapheme-ascii" })
  .filter((s) => s.trim().replace(/\s+/g, " ").length > 0);

const arbRow = fc.record({
  envelopeId: arbEnvelopeId,
  description: arbDescription,
});

const arbRows = fc.array(arbRow, { minLength: 0, maxLength: 100 });

// Wraps a base string with random extra whitespace and case variation, without
// changing its normalised (trim + collapse + lower-case) grouping key.
function withWhitespaceAndCaseNoise(base: string, noise: string, upper: boolean): string {
  const padded = `${noise}${base}${noise}`.replace(/\s+/g, (m) => `${m} `);
  return upper ? padded.toUpperCase() : padded.toLowerCase();
}

describe("rankDescriptions — property tests", () => {
  it("every per-envelope bucket has at most 8 entries", () => {
    fc.assert(
      fc.property(arbRows, (rows) => {
        const result = rankDescriptions(rows);
        for (const bucket of Object.values(result)) {
          expect(bucket.length).toBeLessThanOrEqual(8);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("each envelope's bucket only contains descriptions that were recorded for that envelope", () => {
    fc.assert(
      fc.property(arbRows, (rows) => {
        const result = rankDescriptions(rows);

        for (const [envelopeId, bucket] of Object.entries(result)) {
          const normalizedForEnvelope = new Set(
            rows
              .filter((r) => r.envelopeId === envelopeId)
              .map((r) => r.description.trim().replace(/\s+/g, " ").toLowerCase())
              .filter((key) => key.length > 0),
          );
          for (const suggestion of bucket) {
            const key = suggestion.trim().replace(/\s+/g, " ").toLowerCase();
            expect(normalizedForEnvelope.has(key)).toBe(true);
          }
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("grouping is stable under whitespace/case permutation of the same descriptions", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ envelopeId: arbEnvelopeId, base: arbDescription }), {
          minLength: 1,
          maxLength: 30,
        }),
        fc.array(fc.tuple(fc.constantFrom(" ", "  ", "\t"), fc.boolean()), { minLength: 1, maxLength: 30 }),
        (entries, noiseOptions) => {
          const baseRows = entries.map((e) => ({ envelopeId: e.envelopeId, description: e.base }));
          const noisyRows = entries.map((e, i) => {
            const [noise, upper] = noiseOptions[i % noiseOptions.length];
            return {
              envelopeId: e.envelopeId,
              description: withWhitespaceAndCaseNoise(e.base, noise, upper),
            };
          });

          const baseResult = rankDescriptions(baseRows);
          const noisyResult = rankDescriptions(noisyRows);

          // Same set of envelope keys, same bucket sizes: the grouping key
          // is unaffected by whitespace/case noise, so the number of
          // distinct normalised suggestions per bucket matches — only the
          // displayed spelling may differ.
          expect(Object.keys(noisyResult).sort()).toEqual(Object.keys(baseResult).sort());
          for (const key of Object.keys(baseResult)) {
            expect(noisyResult[key]).toHaveLength(baseResult[key].length);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
