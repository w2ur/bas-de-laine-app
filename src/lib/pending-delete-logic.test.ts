import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  isHidden,
  pendingDeleteReducer as reduce,
  type PendingDeleteAction,
  type PendingDeleteState,
} from "./pending-delete-logic";

const empty: PendingDeleteState = {};

describe("pendingDeleteReducer", () => {
  it("hides a scheduled row and shows it again on cancel", () => {
    const scheduled = reduce(empty, { type: "schedule", id: "a" });
    expect(isHidden(scheduled, "a")).toBe(true);
    expect(isHidden(reduce(scheduled, { type: "cancel", id: "a" }), "a")).toBe(false);
  });

  it("cannot cancel once the commit has started", () => {
    let s = reduce(empty, { type: "schedule", id: "a" });
    s = reduce(s, { type: "commit", id: "a" });
    s = reduce(s, { type: "cancel", id: "a" });
    expect(s.a).toBe("committing");
  });

  it("keeps a deleted row hidden for good", () => {
    let s = reduce(empty, { type: "schedule", id: "a" });
    s = reduce(s, { type: "commit", id: "a" });
    s = reduce(s, { type: "success", id: "a" });
    expect(s.a).toBe("deleted");
    expect(reduce(s, { type: "schedule", id: "a" }).a).toBe("deleted");
    expect(reduce(s, { type: "cancel", id: "a" }).a).toBe("deleted");
  });

  it("shows the row again when the server refuses the delete", () => {
    let s = reduce(empty, { type: "schedule", id: "a" });
    s = reduce(s, { type: "commit", id: "a" });
    s = reduce(s, { type: "failure", id: "a" });
    expect(isHidden(s, "a")).toBe(false);
  });

  it("commits only a pending row (a cancelled one is not sent)", () => {
    let s = reduce(empty, { type: "schedule", id: "a" });
    s = reduce(s, { type: "cancel", id: "a" });
    expect(reduce(s, { type: "commit", id: "a" })).toBe(s);
  });

  it("never reaches deleted without a commit, whatever the sequence", () => {
    const action = fc.record({
      type: fc.constantFrom("schedule", "cancel", "commit", "success", "failure"),
      id: fc.constantFrom("a", "b"),
    }) as fc.Arbitrary<PendingDeleteAction>;
    fc.assert(
      fc.property(fc.array(action, { maxLength: 30 }), (actions) => {
        let s = empty;
        const committed = new Set<string>();
        for (const a of actions) {
          if (a.type === "commit" && s[a.id] === "pending") committed.add(a.id);
          s = reduce(s, a);
          if (s[a.id] === "deleted" && !committed.has(a.id)) return false;
        }
        return true;
      }),
      { numRuns: 1000 },
    );
  });
});
