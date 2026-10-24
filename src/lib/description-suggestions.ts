// Ranks past transaction descriptions into per-envelope suggestion chips.
// Pure logic only — no Prisma import — so it can be unit-tested directly
// (see feedback: files importing next/headers transitively must stay out of tests).

interface DescriptionRow {
  envelopeId: string;
  description: string;
}

interface SpellingEntry {
  count: number;
  firstIndex: number;
}

interface KeyEntry {
  count: number;
  firstIndex: number;
  spellings: Map<string, SpellingEntry>;
}

const TOP_N = 8;

function normalizeKey(description: string): string {
  return description.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSpelling(description: string): string {
  // Same whitespace collapse as the grouping key, but casing is preserved —
  // so two descriptions differing only by internal spacing count as the same
  // spelling instead of splitting the frequency count between variants.
  return description.trim().replace(/\s+/g, " ");
}

function recordEntry(group: Map<string, KeyEntry>, key: string, spelling: string, index: number) {
  const entry = group.get(key);
  if (!entry) {
    group.set(key, {
      count: 1,
      firstIndex: index,
      spellings: new Map([[spelling, { count: 1, firstIndex: index }]]),
    });
    return;
  }

  entry.count += 1;
  entry.firstIndex = Math.min(entry.firstIndex, index);

  const spellingEntry = entry.spellings.get(spelling);
  if (spellingEntry) {
    spellingEntry.count += 1;
    spellingEntry.firstIndex = Math.min(spellingEntry.firstIndex, index);
  } else {
    entry.spellings.set(spelling, { count: 1, firstIndex: index });
  }
}

function mostFrequentSpelling(entry: KeyEntry): string {
  let best: string | null = null;
  let bestEntry: SpellingEntry | null = null;

  for (const [spelling, spellingEntry] of entry.spellings) {
    if (
      !bestEntry ||
      spellingEntry.count > bestEntry.count ||
      (spellingEntry.count === bestEntry.count && spellingEntry.firstIndex < bestEntry.firstIndex)
    ) {
      best = spelling;
      bestEntry = spellingEntry;
    }
  }

  // Non-null because `entry` is only ever created with at least one spelling.
  return best as string;
}

function topDisplayStrings(group: Map<string, KeyEntry>): string[] {
  return [...group.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      // Ties broken by most recent — rows are expected ordered most-recent-first,
      // so a lower firstIndex means it was seen earlier in the (already recency-sorted) input.
      return a.firstIndex - b.firstIndex;
    })
    .slice(0, TOP_N)
    .map(mostFrequentSpelling);
}

/**
 * Groups transaction descriptions per envelope, normalising whitespace/case
 * for grouping while displaying the most frequently used original spelling.
 * Rows are expected ordered most-recent-first; ties in frequency are broken
 * by recency.
 */
export function rankDescriptions(rows: DescriptionRow[]): Record<string, string[]> {
  const perEnvelope = new Map<string, Map<string, KeyEntry>>();

  rows.forEach((row, index) => {
    const key = normalizeKey(row.description);
    if (!key) return;
    const spelling = normalizeSpelling(row.description);

    let envelopeGroup = perEnvelope.get(row.envelopeId);
    if (!envelopeGroup) {
      envelopeGroup = new Map();
      perEnvelope.set(row.envelopeId, envelopeGroup);
    }
    recordEntry(envelopeGroup, key, spelling, index);
  });

  const result: Record<string, string[]> = {};
  for (const [envelopeId, group] of perEnvelope) {
    result[envelopeId] = topDisplayStrings(group);
  }

  return result;
}
