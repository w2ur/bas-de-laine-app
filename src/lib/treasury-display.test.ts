import { describe, it, expect } from "vitest";
import {
  adjustmentDisplayLabel,
  isTreasuryStale,
  lastBalanceWrite,
  TREASURY_STALE_AFTER_DAYS,
} from "./treasury-display";

describe("adjustmentDisplayLabel", () => {
  it("shows a default label alone instead of repeating the type", () => {
    expect(adjustmentDisplayLabel("REFRESH", "Synchronisation avec les comptes")).toBe(
      "Synchronisation avec les comptes",
    );
    expect(adjustmentDisplayLabel("SET", "Mise à jour du solde")).toBe("Mise à jour du solde");
  });

  it("prefixes a user label with the type", () => {
    expect(adjustmentDisplayLabel("DEDUCT", "Réparation")).toBe("Déduction — Réparation");
    expect(adjustmentDisplayLabel("SET", "Prime")).toBe("Solde défini — Prime");
  });

  it("falls back to the default or the type label for an empty or blank label", () => {
    expect(adjustmentDisplayLabel("SET", null)).toBe("Mise à jour du solde");
    expect(adjustmentDisplayLabel("DEDUCT", "  ")).toBe("Déduction");
  });
});

describe("lastBalanceWrite", () => {
  it("takes the latest adjustment whatever the input order", () => {
    const adj = [
      { createdAt: new Date("2026-03-01T10:00:00Z") },
      { createdAt: new Date("2026-04-01T10:00:00Z") },
      { createdAt: new Date("2026-02-01T10:00:00Z") },
    ];
    expect(lastBalanceWrite(adj)?.toISOString()).toBe("2026-04-01T10:00:00.000Z");
  });

  it("returns null when no balance write was ever recorded", () => {
    expect(lastBalanceWrite([])).toBeNull();
  });
});

describe("isTreasuryStale", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  it("is fresh up to the threshold and stale past it", () => {
    expect(isTreasuryStale(daysAgo(TREASURY_STALE_AFTER_DAYS), now)).toBe(false);
    expect(isTreasuryStale(daysAgo(TREASURY_STALE_AFTER_DAYS + 1), now)).toBe(true);
  });

  it("is not stale when there is no write to judge", () => {
    expect(isTreasuryStale(null, now)).toBe(false);
  });
});
