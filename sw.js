const CACHE_NAME = "carechat-wave1-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
];

function isCriticalShellRequest(request) {
  if (request.mode === "navigate") return true;
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    const p = url.pathname;
    return (
      p.endsWith("/app.js") ||
      p.endsWith("/config.js") ||
      p.endsWith("/styles.css") ||
      p.endsWith("/index.html")
    );
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Always hit network for the worker script so deploys can update; never serve stale sw.js from cache.
  if (url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  if (isCriticalShellRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  // Never cache cross-origin APIs (e.g. Supabase REST). The previous cache-first+put path cached
  // GET /rest/v1/messages — mutations are POST (not intercepted) so the DB updated but every
  // poll/loadMessages kept serving the first cached JSON; edits/deletes/new rows never appeared.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        const copy = resp.clone();
        if (resp.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return resp;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Care Chat", body: "New message received." };
  }
  const title = payload.title || "Care Chat";
  const body = payload.body || "New message received.";
  const url = payload.url || "/";
  const options = {
    body,
    tag: payload.tag || "carechat-dad-inbound",
    renotify: true,
    requireInteraction: true,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return Promise.resolve();
    })
  );
});
