/**
 * A transaction delete waits out an undo window before it reaches the server
 * (DESIGN.md, "Transaction row"). This reducer is the whole state of those
 * deletes; the provider only adds timers and the server call.
 *
 * - pending: hidden, can still be cancelled;
 * - committing: hidden, the server call is in flight (too late to cancel);
 * - deleted: hidden for good — kept so a revalidation that still carries the
 *   row (e.g. a stale RSC payload) does not show it again.
 * A cancel or a refused commit removes the id, and the row is shown again.
 */
export type PendingDeleteStatus = "pending" | "committing" | "deleted";
export type PendingDeleteState = Readonly<Record<string, PendingDeleteStatus>>;

export type PendingDeleteAction =
  | { type: "schedule"; id: string }
  | { type: "cancel"; id: string }
  | { type: "commit"; id: string }
  | { type: "success"; id: string }
  | { type: "failure"; id: string };

export function pendingDeleteReducer(state: PendingDeleteState, action: PendingDeleteAction): PendingDeleteState {
  const current = state[action.id];
  switch (action.type) {
    case "schedule":
      return current ? state : { ...state, [action.id]: "pending" };
    case "cancel":
      return current === "pending" ? without(state, action.id) : state;
    case "commit":
      return current === "pending" ? { ...state, [action.id]: "committing" } : state;
    case "success":
      return current === "committing" ? { ...state, [action.id]: "deleted" } : state;
    case "failure":
      return current === "committing" ? without(state, action.id) : state;
  }
}

export function isHidden(state: PendingDeleteState, id: string): boolean {
  return state[id] !== undefined;
}

function without(state: PendingDeleteState, id: string): PendingDeleteState {
  const next = { ...state };
  delete next[id];
  return next;
}
