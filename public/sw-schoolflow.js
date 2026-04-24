// =============================================================================
// SchoolFlow Pro — Service Worker Offline (Guinea Edition)
// =============================================================================
// Strategy:
//   - Static assets (JS/CSS/fonts/images): Cache-First (serve from cache, update in background)
//   - Navigation (HTML): Network-First with offline fallback to cached index.html
//   - API calls (/api/v1/, backend host): NEVER intercepted — pass through to network
//
// This SW solves the "Failed to fetch" error from previous Workbox implementation
// by explicitly excluding all API traffic. Offline data sync is handled at the
// application layer via IndexedDB (Dexie). The SW only manages the app shell.
// =============================================================================

const CACHE_NAME = "schoolflow-offline-v2";
const SHELL_CACHE = "schoolflow-shell-v2";

// API patterns to NEVER intercept — always pass through to network
const API_PATTERNS = [
  /\/api\/v1\//,
  /localhost:8000/,
  /\.onrender\.com/,
  /\.railway\.app/,
  /\.fly\.dev/,
  /\/api-proxy\//,
];

function isApiRequest(url) {
  return API_PATTERNS.some((pattern) => pattern.test(url));
}

function isStaticAsset(url) {
  // Vite build output: /assets/vendor-xxx-[hash].js, /assets/index-[hash].css, etc.
  return (
    /\/assets\/.*\.(js|css|woff2?|ttf|eot)/.test(url) ||
    /\.(png|jpg|jpeg|svg|ico|webp|gif)(\?.*)?$/.test(url)
  );
}

// ── Install: cache the app shell immediately ──────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => {
        // Pre-cache only the root — JS bundles cached on first fetch
        return cache.add("/").catch(() => {
          // / might redirect, try index.html directly
          return cache.add("/index.html").catch(() => {});
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: route requests ─────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // ── 1. Skip non-GET and API calls entirely ────────────────────────────────
  if (request.method !== "GET" || isApiRequest(url)) {
    return; // Let browser handle normally
  }

  // ── 2. Navigation requests (HTML pages) ───────────────────────────────────
  // Network-first: try to get fresh HTML, fall back to cached app shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // Update app shell cache with fresh response
            caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Offline: serve the cached app shell
          return (
            caches.match(request) ||
            caches.match("/") ||
            caches.match("/index.html")
          );
        })
    );
    return;
  }

  // ── 3. Static assets: Cache-First ─────────────────────────────────────────
  // Hashed assets (immutable) → serve from cache immediately
  // Non-hashed assets → revalidate in background
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Has a hash in filename → truly immutable, serve directly
          if (/\/assets\/.*-[a-f0-9]{8,}\./.test(url)) {
            return cached;
          }
          // No hash → revalidate in background (stale-while-revalidate)
          const networkFetch = fetch(request)
            .then((response) => {
              if (response.ok) {
                caches
                  .open(CACHE_NAME)
                  .then((cache) => cache.put(request, response.clone()));
              }
              return response;
            })
            .catch(() => cached);
          return cached; // Return cached immediately, update in background
        }

        // Not cached: fetch and store
        return fetch(request).then((response) => {
          if (response.ok) {
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── 4. Everything else: Network-only ──────────────────────────────────────
  // Don't cache dynamic content (unknown patterns, WebSocket upgrades, etc.)
});

// ── Message: force update ─────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
