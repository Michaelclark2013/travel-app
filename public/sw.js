// Voyage service worker — caches the wallet shell so the wallet view works
// offline. Wallet data itself is mirrored to localStorage by the page so it
// is available without a network round-trip.

const CACHE = "voyage-wallet-v1";
const SHELL = ["/wallet", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for the wallet HTML (so updates ship immediately when online),
  // cache-first for static assets, never cache API routes.
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname === "/wallet" || url.pathname.startsWith("/wallet/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((r) => r ?? caches.match("/wallet")))
    );
    return;
  }

  if (
    /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?)$/.test(url.pathname) ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ??
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
              return res;
            })
            .catch(() => cached as Response)
      )
    );
  }
});
