"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteEnvelopeTransaction } from "@/actions/envelopes";
import {
  isHidden,
  pendingDeleteReducer,
  type PendingDeleteAction,
  type PendingDeleteState,
} from "@/lib/pending-delete-logic";

/** How long « Annuler » stays on offer before the delete reaches the server. */
export const UNDO_WINDOW_MS = 5000;

interface PendingDeleteContextValue {
  /**
   * Hide the row now and delete it once the undo window lapses. `linkedId` is
   * a transfer's other leg: the server deletes both, so both are hidden and
   * guarded, and only `id` is sent.
   */
  scheduleDelete: (id: string, linkedId?: string | null) => void;
  isHidden: (id: string) => boolean;
}

const PendingDeleteContext = createContext<PendingDeleteContextValue | null>(null);

interface ScheduledDelete {
  /** Every id the delete hides: the row and, for a transfer, its other leg. */
  ids: string[];
  timer: ReturnType<typeof setTimeout>;
  toastId: string | number;
}

/**
 * Holds every transaction delete still inside its undo window (DESIGN.md,
 * "Transaction row"). Mounted in the (app) layout, above every list, so a
 * revalidation or a client navigation neither shows a hidden row again nor
 * drops a pending delete.
 *
 * A delete commits when its window lapses, or at once when the app is hidden
 * or the page is being left (visibilitychange, pagehide). A request started
 * while the page is torn down can still be aborted: then nothing is deleted
 * and the row is back on the next load — the safe direction. The server
 * action is the existing guarded delete, unchanged.
 */
export function PendingDeleteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(pendingDeleteReducer, {} as PendingDeleteState);
  // The same reducer, applied synchronously, so timers, the toast and the
  // page-lifecycle handlers read the current state without waiting for a render.
  const stateRef = useRef<PendingDeleteState>({});
  const scheduled = useRef(new Map<string, ScheduledDelete>());

  const apply = useCallback((type: PendingDeleteAction["type"], ids: string[]) => {
    for (const id of ids) {
      const action = { type, id } as PendingDeleteAction;
      stateRef.current = pendingDeleteReducer(stateRef.current, action);
      dispatch(action);
    }
  }, []);

  const commit = useCallback(
    async (id: string) => {
      const entry = scheduled.current.get(id);
      // Only a scheduled, still-pending delete is sent; it leaves the map
      // before the first await, so a second trigger sends nothing.
      if (!entry || stateRef.current[id] !== "pending") return;
      scheduled.current.delete(id);
      clearTimeout(entry.timer);
      toast.dismiss(entry.toastId);
      apply("commit", entry.ids);
      try {
        const result = await deleteEnvelopeTransaction(id);
        if (result?.error) {
          // The server refused: nothing was deleted.
          apply("failure", entry.ids);
          toast.error(result.error);
          return;
        }
        apply("success", entry.ids);
      } catch {
        // No answer: the delete may or may not have happened. Show the rows
        // again and reload the data, which says which.
        apply("failure", entry.ids);
        router.refresh();
        toast.error("La suppression n'a pas pu être confirmée. Vérifiez la liste.");
      }
    },
    [apply, router],
  );

  const scheduleDelete = useCallback(
    (id: string, linkedId?: string | null) => {
      if (stateRef.current[id]) return;
      const ids = linkedId && !stateRef.current[linkedId] ? [id, linkedId] : [id];
      apply("schedule", ids);
      const toastId = toast("Transaction supprimée", {
        duration: UNDO_WINDOW_MS,
        action: {
          label: "Annuler",
          onClick: () => {
            const entry = scheduled.current.get(id);
            if (!entry || stateRef.current[id] !== "pending") {
              toast.error("Trop tard : la suppression est déjà partie.");
              return;
            }
            scheduled.current.delete(id);
            clearTimeout(entry.timer);
            apply("cancel", entry.ids);
          },
        },
      });
      scheduled.current.set(id, {
        ids,
        toastId,
        timer: setTimeout(() => void commit(id), UNDO_WINDOW_MS),
      });
    },
    [apply, commit],
  );

  useEffect(() => {
    const flush = () => {
      for (const id of [...scheduled.current.keys()]) void commit(id);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    // No flush on cleanup: a cleanup also runs on a dev re-mount, where it
    // would send a delete the user could still cancel.
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [commit]);

  const value = useMemo(
    () => ({ scheduleDelete, isHidden: (id: string) => isHidden(state, id) }),
    [scheduleDelete, state],
  );

  return <PendingDeleteContext.Provider value={value}>{children}</PendingDeleteContext.Provider>;
}

export function usePendingDelete() {
  const ctx = useContext(PendingDeleteContext);
  if (!ctx) throw new Error("usePendingDelete must be used within PendingDeleteProvider");
  return ctx;
}
