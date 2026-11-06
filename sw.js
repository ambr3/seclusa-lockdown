/*
 * Seclusa app service worker — offline-first, zero third-party contact.
 *
 * Copy as-is and bump VERSION when you change anything it lists. That string
 * is the whole cache-invalidation mechanism: the cache is named after it, and a
 * new name means a new cache, and the old one is deleted on activation.
 *
 * Rename CACHE_PREFIX to something unique to this app (e.g. "seclusa-bp-").
 * The Cache API is origin-wide, so a shared prefix lets one app delete another
 * app's shell on activate.
 *
 * Design constraints this file encodes, each of which is a bug otherwise:
 *
 *   - GET only. Intercepting a POST and replaying it from cache is how you turn a
 *     failed write into a silent one.
 *   - Same-origin only. Anything cross-origin passes straight through, so a bug here
 *     can never become a data leak to another origin.
 *   - Bounded by name, and only its own cache. Bare `caches.match()` searches every
 *     cache on the origin, which is how one app ends up serving another app's
 *     offline.html under a URL that looks right.
 *   - Queries are not cacheable unless we made them. See cacheable().
 *   - Shell assets are network-first (like navigations). Cache-first JS/CSS plus
 *     SRI on a fresh index.html is how a deploy bricks returning visitors until
 *     they hard-reload: new hashes, old bytes.
 */

const VERSION = "1.9.0";
const CACHE_PREFIX = "seclusa-lockdown-";
const CACHE = `${CACHE_PREFIX}v${VERSION}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./static/css/seclusa-base.css",
  "./static/css/app.css",
  "./static/js/theme-boot.js",
  "./static/js/theme.js",
  "./static/js/store.js",
  "./static/js/settings.js",
  "./static/js/audio.js",
  "./static/js/map.js",
  "./static/js/input.js",
  "./static/js/game.js",
  "./static/js/app.js",
  "./static/icons/icon.svg",
  "./static/icons/icon-192.png",
  "./static/icons/icon-512.png",
  "./static/icons/icon-maskable-512.png",
];

/**
 * Whether a URL may be written to the cache at all.
 *
 * Entries are keyed on the whole request, query string included, and the only
 * eviction is a cache-*name* change when VERSION moves. So every distinct
 * query is a distinct entry that nothing ever reclaims. Any origin answers 200
 * for `/?anything`, which means ordinary links carrying junk parameters grow a
 * visitor's storage without bound — caused entirely by someone else, on an
 * app whose whole point is keeping data on the device.
 *
 * Only the two shapes this app actually emits are kept: no query, and the `?v=`
 * stamp for cache-busting. `URL.search` includes the leading `?`. Everything
 * else is served from the network and never written down.
 */
function cacheable(url) {
  return url.search === "" || /^\?v=[0-9][\d.]*$/.test(url.search);
}

/**
 * The cached shell, from this worker's own cache only.
 *
 * A bare `caches.match()` searches every cache on the origin, which is how
 * one app ends up serving another app's offline.html under a URL that looks
 * right. The cache is opened by name for the same reason.
 */
async function cachedShell(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const offline = await cache.match("./offline.html");
  if (offline) return offline;
  return cache.match("./");
}

const REQUIRED = ["./index.html", "./offline.html", "./static/js/app.js", "./static/css/app.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One at a time, not addAll: a single 404 in an all-or-nothing call leaves an
      // empty cache that still has the right name, which is indistinguishable from a
      // healthy one until the user is offline.
      await Promise.allSettled(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })))
      );
      // Allsettled alone still lets an install with every file missing succeed and
      // leave an empty shell behind. Refuse instead, so the browser retries the
      // install on the next visit rather than activating a blank offline app.
      for (const url of REQUIRED) {
        if (!(await cache.match(url))) {
          await caches.delete(CACHE);
          throw new Error("precache incomplete: " + url);
        }
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Scoped by our own prefix. A bare `caches.delete` loop across the whole
      // origin takes out every other app hosted alongside this one.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations and same-origin assets: network first. A deploy must not be
  // shadowed by stale JS/CSS while a fresh index.html carries new SRI hashes.
  // Stamp shell assets with ?v=VERSION in HTML/precache so older cache-first
  // workers miss and fetch fresh bytes.
  event.respondWith(
    fetch(request)
      .then((response) => {
        // status, not ok: ok is also true for 206, which Cache.put rejects
        // outright. type === "basic" keeps opaque/cross-origin noise out.
        if (
          response &&
          response.status === 200 &&
          cacheable(url) &&
          (request.mode === "navigate" || response.type === "basic")
        ) {
          const copy = response.clone();
          // waitUntil, not fire-and-forget: once respondWith settles the worker
          // may be terminated, so an unwaited put can simply be lost — and a
          // page that loaded fine online is then missing from the offline copy.
          event.waitUntil(
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          );
          return response;
        }
        if (request.mode === "navigate") {
          // The network answered, but not with the app: a proxy error page, a
          // captive portal, a 404 from a file that has been renamed. Those are
          // the shapes an offline app meets most often, and showing the error
          // page is the wrong answer — the cached shell is right there and it
          // works. So a non-200 falls back to the cache rather than through.
          return cachedShell(request).then((hit) => hit || response);
        }
        return response;
      })
      .catch(async () => {
        if (request.mode === "navigate") return cachedShell(request);
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        return hit || Response.error();
      })
  );
});
