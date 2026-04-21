// APEX Coach — Service Worker
// v2 : ajout des handlers push (hypo/hyper alerts) + notificationclick
const CACHE_NAME = "apex-coach-v2";

const PRECACHE_URLS = [
  "/",
  "/muscu",
  "/nutrition",
  "/running",
  "/diabete",
  "/profil",
  "/profil/diagnostic",
  "/manifest.json",
];

// Install: precache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for pages/API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip API routes — always network
  if (url.pathname.startsWith("/api/")) return;

  // Static assets (images, fonts, js, css): stale-while-revalidate
  if (
    url.pathname.match(/\.(?:js|css|woff2?|ttf|eot|ico|png|jpg|jpeg|gif|svg|webp)$/i) ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetched = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetched;
        })
      )
    );
    return;
  }

  // Pages: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});

// ─── Push notifications ──────────────────────────────────────────
// Reçoit les pushes envoyés par /api/cron/glucose-check (hypo/hyper alerts).
// Payload attendu : { type, title, body, value?, url? }

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (_e) {
    payload = {
      title: "APEX Coach",
      body: event.data.text(),
    };
  }

  const title = payload.title || "APEX Coach";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.type || "apex-alert",
    // Les alertes hypo/hyper sont urgentes → renotify + vibration
    renotify: payload.type === "hypo" || payload.type === "hyper",
    requireInteraction: payload.type === "hypo",
    vibrate: payload.type === "hypo" ? [200, 100, 200, 100, 400] : [200, 100, 200],
    data: {
      url: payload.url || "/diabete",
      type: payload.type,
      value: payload.value,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Au tap sur la notif : on focus (ou ouvre) la page indiquée.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/diabete";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Si une fenêtre APEX est déjà ouverte → la focus + navigue
        for (const client of clientList) {
          const url = new URL(client.url);
          const sameOrigin = url.origin === self.location.origin;
          if (sameOrigin && "focus" in client) {
            if ("navigate" in client && url.pathname !== targetUrl) {
              return client.navigate(targetUrl).then(() => client.focus());
            }
            return client.focus();
          }
        }
        // Sinon on ouvre un nouvel onglet / la PWA
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
