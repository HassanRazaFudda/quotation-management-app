/*
 * Service worker for Junaidi Quotations.
 *
 * Deliberately small:
 *  - navigations are network-first with a cached fallback, so the installed
 *    app still opens offline but never serves a stale page shell;
 *  - Next's build assets under /_next/static are content-hashed and therefore
 *    safe to serve cache-first;
 *  - API calls and PDFs are left entirely alone - they need the network and
 *    must be fresh, since a stale rate or total is worse than an error.
 *
 * A response body can only be read once, so every copy kept for the cache is
 * cloned SYNCHRONOUSLY, before the response is handed to the page. Cloning
 * inside a later `.then()` throws "Response body is already used".
 */

const CACHE = "junaidi-v2";
/** Enough to render something useful when the network is gone. */
const OFFLINE_FALLBACK = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_FALLBACK, "/manifest.webmanifest"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Store a copy without disturbing the response being returned. */
function cachePut(request, response) {
  if (!response || !response.ok || response.type === "opaque") return;
  const copy = response.clone(); // must happen before the body is consumed
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // The API lives on another origin and is always dynamic.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Pages: prefer the network so a new deploy is picked up immediately.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response);
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_FALLBACK)),
        ),
    );
    return;
  }

  // Build assets are content-hashed, so a cache hit can never be stale.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            cachePut(request, response);
            return response;
          }),
      ),
    );
    return;
  }

  // Anything else: straight to the network, no caching.
});
