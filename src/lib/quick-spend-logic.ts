/** localStorage key holding the envelope of this device's last spend. */
export const LAST_SPEND_ENVELOPE_KEY = "bdl:lastSpendEnvelope";

interface PickableEnvelope {
  id: string;
  type: "BUDGET" | "GOAL";
}

/**
 * The envelope the quick sheet opens on. The envelope it was opened from
 * wins; otherwise the one this device last spent from, as long as it is still
 * listed and can take the current mode (a GOAL cannot be spent from);
 * otherwise none, and the household picks.
 */
export function pickDefaultEnvelope(
  openerId: string | null,
  storedId: string | null,
  envelopes: PickableEnvelope[],
  mode: "SPEND" | "FILL",
): string | null {
  if (openerId) return openerId;
  if (!storedId) return null;
  const stored = envelopes.find((e) => e.id === storedId);
  if (!stored) return null;
  if (mode === "SPEND" && stored.type !== "BUDGET") return null;
  return stored.id;
}
