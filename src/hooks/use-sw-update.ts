"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Listens for service worker controller changes (triggered when skipWaiting
 * activates a new SW version) and shows a "reload to update" toast.
 *
 * This avoids the silent mid-session swap that could confuse the user if the
 * UI changes while they are actively using the app.
 */
export function useSwUpdate(): void {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let isFirstController = true;

    function handleControllerChange() {
      // The first controllerchange fires when the SW claims the client on
      // initial install — that is not an update. Skip it.
      if (isFirstController) {
        isFirstController = false;
        return;
      }

      toast("Mise à jour disponible", {
        description: "Une nouvelle version de l'application est prête.",
        duration: Infinity,
        action: {
          label: "Actualiser",
          onClick: () => window.location.reload(),
        },
      });
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);
}
