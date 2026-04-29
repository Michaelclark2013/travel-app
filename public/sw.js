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

// Allow the page (SwRegister) to nudge a waiting worker to activate without
// the user having to close every tab.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
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

// Web Push handler. Server payload is an opaque JSON blob with title/body/url.
// We try to parse it; if anything is missing, we fall back to a generic
// "Voyage" notification so push opt-in users always see something.
self.addEventListener("push", (event) => {
  let payload = { title: "Voyage", body: "", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {
    /* ignore — non-JSON payloads fall back to defaults */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/apple-icon",
      badge: "/icon",
      data: { url: payload.url || "/" },
    })
  );
});

// Tap on a notification: focus an existing tab, otherwise open a new one
// pointed at the URL the server asked for.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
