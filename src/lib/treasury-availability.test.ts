import { describe, it, expect } from "vitest";
import { groupPoolsByAvailability } from "./treasury-availability";

describe("groupPoolsByAvailability", () => {
  const pools = [
    { id: "a", availability: "LONG" as const, amount: 100 },
    { id: "b", availability: "IMMEDIATE" as const, amount: 10.1 },
    { id: "c", availability: "IMMEDIATE" as const, amount: 5.05 },
  ];

  it("orders tiers IMMEDIATE → SHORT → LONG and drops empty ones", () => {
    expect(groupPoolsByAvailability(pools).map((g) => g.tier)).toEqual(["IMMEDIATE", "LONG"]);
  });

  it("totals each tier for its heading", () => {
    const [immediate, long] = groupPoolsByAvailability(pools);
    expect(immediate.total).toBeCloseTo(15.15, 6);
    expect(long.total).toBe(100);
  });
});
