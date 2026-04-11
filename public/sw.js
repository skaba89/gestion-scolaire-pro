// =============================================================================
// SchoolFlow Pro — Service Worker Killer
// =============================================================================
// This file replaces any previous Service Worker (e.g. Workbox/PWA) and
// removes all cached data. After cleanup, it self-unregisters.
//
// Used when PWA is disabled to clean up leftover Workbox SWs from previous
// deployments. Registered early in main.tsx on onrender.com / when
// VITE_FORCE_SW_RESET=true.
// =============================================================================

// Skip the waiting queue — activate immediately
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// On activation: claim all clients, clear all caches, then self-unregister
self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Step 1: Clear all caches
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    )
    // Step 2: Claim clients (with error handling for race condition)
    .then(() => self.clients.claim().catch(() => {}))
    // Step 3: Unregister self
    .then(() => self.registration.unregister())
    .catch(() => {}) // Ignore all errors
  );
});

// Pass-through fetch handler: don't intercept any requests.
// This prevents "no-response" errors from Workbox strategies.
self.addEventListener("fetch", (event) => {
  // Let the browser handle the request normally (no caching, no interception)
  event.respondWith(fetch(event.request));
});
