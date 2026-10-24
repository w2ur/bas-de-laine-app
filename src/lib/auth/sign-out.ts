"use client";

import { PAGE_CACHE_NAMES } from "@/lib/pwa/cache-names";
import { authClient } from "./client";

/**
 * Ends the Neon Auth session, having first dropped every CacheStorage entry holding
 * rendered pages or RSC payloads — otherwise the next person to open the app can read
 * the previous user's balances straight out of the cache.
 *
 * Never returns: it finishes with a full page load of the sign-in page.
 */
export async function signOutAndPurge() {
  try {
    if ("caches" in window) {
      await Promise.all(PAGE_CACHE_NAMES.map((name) => caches.delete(name)));
    }
  } catch {
    // A cache that refuses to be deleted must not keep the user signed in. Ending the
    // session is the security-critical half; a stale cache entry is the lesser evil,
    // and the service worker already keeps these caches empty in the first place.
  }

  await authClient.signOut();

  // Hard navigation rather than router.push(): it tears down the Next.js router cache
  // and the financial page still rendered in memory, both of which a client-side
  // transition would keep alive after the session is gone. That is precisely what the
  // lint rule below discourages, and precisely why it is wanted here.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/auth/sign-in");
}
