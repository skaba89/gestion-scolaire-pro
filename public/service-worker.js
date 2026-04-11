// =============================================================================
// SchoolFlow Pro — Service Worker Killer (alias)
// =============================================================================
// Identical to sw.js. Some browsers/registerations may reference this filename.
// =============================================================================
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    )
    .then(() => self.clients.claim().catch(() => {}))
    .then(() => self.registration.unregister())
    .catch(() => {})
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
