import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { dragOutcome, DISMISS_DISTANCE_RATIO, DISMISS_VELOCITY } from "./bottom-sheet-logic";

const base = { height: 500, velocity: 0, dirty: false, alreadyWarned: false };

describe("dragOutcome", () => {
  it("snaps back a short, slow drag", () => {
    expect(dragOutcome({ ...base, dy: 100 })).toBe("snap-back");
  });

  it("dismisses past the distance threshold", () => {
    expect(dragOutcome({ ...base, dy: 500 * DISMISS_DISTANCE_RATIO + 1 })).toBe("dismiss");
  });

  it("dismisses a fast flick whatever the distance", () => {
    expect(dragOutcome({ ...base, dy: 20, velocity: DISMISS_VELOCITY + 0.1 })).toBe("dismiss");
  });

  it("never dismisses an upward drag, however fast", () => {
    expect(dragOutcome({ ...base, dy: -300, velocity: 5 })).toBe("snap-back");
  });

  it("warns once on a dirty sheet, then dismisses", () => {
    const drag = { ...base, dy: 400, dirty: true };
    expect(dragOutcome(drag)).toBe("warn");
    expect(dragOutcome({ ...drag, alreadyWarned: true })).toBe("dismiss");
  });

  it("does not warn on a drag that would not have dismissed", () => {
    expect(dragOutcome({ ...base, dy: 10, dirty: true })).toBe("snap-back");
  });

  it("relies on velocity alone when the height is unknown", () => {
    expect(dragOutcome({ ...base, height: 0, dy: 300 })).toBe("snap-back");
    expect(dragOutcome({ ...base, height: 0, dy: 300, velocity: 1 })).toBe("dismiss");
  });

  it("a clean sheet is never warned", () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -2000, max: 2000 }),
        fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 2000 }),
        fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 10 }),
        (dy, height, velocity) =>
          dragOutcome({ dy, height, velocity, dirty: false, alreadyWarned: false }) !== "warn",
      ),
      { numRuns: 1000 },
    );
  });
});
