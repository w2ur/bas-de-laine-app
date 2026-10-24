/**
 * Every CacheStorage name that can hold rendered pages or RSC payloads — i.e. the
 * household's financial data.
 *
 * Two consumers, one list, so they cannot desync: `src/sw.ts` keeps these caches out
 * of the service worker's runtime caching, and `signOutAndPurge()` deletes them when
 * the session ends. A name present in one place but not the other would leave balances
 * readable from CacheStorage after sign-out.
 *
 * The three `pages*` entries are the values of `PAGES_CACHE_NAME` in
 * `@serwist/next/worker`. They are repeated as literals here because importing that
 * module drags the whole service-worker runtime (`defaultCache`, its `Strategy`
 * instances) into the client bundle; `src/sw.ts` type-checks the two against each
 * other instead.
 */
export const PAGE_CACHE_NAMES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
  "cross-origin",
] as const;

export type PageCacheName = (typeof PAGE_CACHE_NAMES)[number];
