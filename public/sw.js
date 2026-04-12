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

// NO fetch event listener!
// The previous version had event.respondWith(fetch(event.request)) which
// intercepted all requests and caused "Failed to fetch" errors, especially
// during Render cold starts or when the SW was in an intermediate state.
// By not registering a fetch handler at all, the browser will handle all
// requests normally (bypassing the SW entirely for fetches).
