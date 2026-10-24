import { defaultCache, PAGES_CACHE_NAME } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, Strategy } from "serwist";
import { PAGE_CACHE_NAMES, type PageCacheName } from "@/lib/pwa/cache-names";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Compile-time guard against the shared list drifting from Serwist's own names: if
// @serwist/next renames a page cache, its literal type no longer fits PageCacheName
// and this annotation stops type-checking. Keeping the two in step matters because
// signOutAndPurge() deletes the same list on sign-out.
const serwistPageCaches: readonly PageCacheName[] = [
  PAGES_CACHE_NAME.rscPrefetch,
  PAGES_CACHE_NAME.rsc,
  PAGES_CACHE_NAME.html,
];

// Cache names that contain authenticated page content — these must not be
// persisted to CacheStorage so that financial data is not readable after logout.
const pageCacheNames = new Set<string>([...PAGE_CACHE_NAMES, ...serwistPageCaches]);

// Keep only static-asset caches; remove all caches that store HTML/RSC
// navigation responses (authenticated pages with financial data).
const staticOnlyCache = defaultCache.filter((entry) => {
  const handler = entry.handler;
  if (handler instanceof Strategy) {
    return !pageCacheNames.has(handler.cacheName);
  }
  // Non-Strategy handlers (plain callbacks) are kept; they are NetworkOnly
  // entries that never write to CacheStorage.
  return true;
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Static offline fallback: shown when a navigation request fails and no
  // cached response is available. Contains no financial data.
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
  runtimeCaching: staticOnlyCache,
});

serwist.addEventListeners();
