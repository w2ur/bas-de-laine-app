/** Share of the sheet's height a drag must pass to dismiss it. */
export const DISMISS_DISTANCE_RATIO = 0.3;
/** Downward speed (px/ms) that dismisses whatever the distance. */
export const DISMISS_VELOCITY = 0.5;

export type DragOutcome = "dismiss" | "snap-back" | "warn";

/**
 * What a released drag on the sheet's grabber does. A sheet holding unsaved
 * input ("dirty") answers the first dismissing gesture with a snap-back
 * ("warn"), so a stray swipe does not throw away a typed amount; the next
 * one dismisses.
 */
export function dragOutcome({
  dy,
  height,
  velocity,
  dirty,
  alreadyWarned,
}: {
  /** Downward distance dragged, px; negative when dragged up. */
  dy: number;
  height: number;
  /** Downward speed at release, px/ms. */
  velocity: number;
  dirty: boolean;
  alreadyWarned: boolean;
}): DragOutcome {
  if (dy <= 0) return "snap-back";
  const farEnough = height > 0 && dy / height > DISMISS_DISTANCE_RATIO;
  const fastEnough = velocity > DISMISS_VELOCITY;
  if (!farEnough && !fastEnough) return "snap-back";
  if (dirty && !alreadyWarned) return "warn";
  return "dismiss";
}
