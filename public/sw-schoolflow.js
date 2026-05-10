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

const CACHE_NAME = "schoolflow-offline-v3";
const SHELL_CACHE = "schoolflow-shell-v3";

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
  return (
    /\/assets\/.*\.(js|css|woff2?|ttf|eot)/.test(url) ||
    /\.(png|jpg|jpeg|svg|ico|webp|gif)(\?.*)?$/.test(url)
  );
}

async function putInCache(cacheName, request, response) {
  if (!response || !response.ok) return;
  try {
    const responseForCache = response.clone();
    const cache = await caches.open(cacheName);
    await cache.put(request, responseForCache);
  } catch (error) {
    // Never break navigation/static loading because of a cache write failure.
    console.warn("[sw-schoolflow] cache put skipped:", error);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => {
        return cache.add("/").catch(() => {
          return cache.add("/index.html").catch(() => {});
        });
      })
      .then(() => self.skipWaiting())
  );
});

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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  if (request.method !== "GET" || isApiRequest(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          event.waitUntil(putInCache(SHELL_CACHE, request, response));
          return response;
        } catch (_) {
          return (
            (await caches.match(request)) ||
            (await caches.match("/")) ||
            (await caches.match("/index.html")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        if (cached) {
          if (/\/assets\/.*-[a-f0-9]{8,}\./.test(url)) {
            return cached;
          }

          event.waitUntil(
            fetch(request)
              .then((response) => putInCache(CACHE_NAME, request, response))
              .catch(() => undefined)
          );
          return cached;
        }

        const response = await fetch(request);
        event.waitUntil(putInCache(CACHE_NAME, request, response));
        return response;
      })()
    );
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});
