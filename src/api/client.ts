import axios from 'axios';

const TOKEN_STORAGE_KEY = 'schoolflow:access_token';

// Mutex for token refresh — prevents concurrent refresh calls
let refreshPromise: Promise<string> | null = null;

function isLocalHost(value: string): boolean {
  return /localhost|127\.0\.0\.1/.test(value);
}

/**
 * Resolve the API base URL using this priority:
 *
 * 1. Runtime config  (window.__SCHOOLFLOW_CONFIG__.API_URL)
 *    → Set in dist/config.js on the server AFTER build.
 *      Supports any hosting (Render, Netlify, S3, Nginx…).
 *
 * 2. Build-time env  (VITE_API_URL)
 *    → Baked in at `npm run build`.  Good for Docker / single-env deploys.
 *
 * 3. Sensible defaults
 *    → localhost:8000 when running locally, /api-proxy in production
 *      (requires an nginx / Netlify / Cloudflare proxy).
 */
function resolveApiBaseUrl(rawValue?: string): string {
  // ── Priority 1: runtime config (editable without rebuild) ─────────────
  const runtimeCfg = (window as any).__SCHOOLFLOW_CONFIG__;
  if (runtimeCfg?.API_URL && typeof runtimeCfg.API_URL === 'string') {
    const runtimeUrl = runtimeCfg.API_URL.trim();
    if (runtimeUrl) {
      return runtimeUrl;
    }
  }

  // ── Priority 2: build-time env var ────────────────────────────────────
  const trimmed = rawValue?.trim();
  if (trimmed) {
    const isBrowserLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
    if (!isBrowserLocal && isLocalHost(trimmed)) {
      // Build-time URL points to localhost but browser is remote → use proxy
      return '/api-proxy';
    }
    return trimmed;
  }

  // ── Priority 3: defaults ──────────────────────────────────────────────
  const isBrowserLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
  return isBrowserLocal ? 'http://localhost:8000' : '/api-proxy';
}

export const apiClient = axios.create({
  baseURL: `${resolveApiBaseUrl(import.meta.env.VITE_API_URL)}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const lastTenantId = localStorage.getItem('last_tenant_id');
    // Only send X-Tenant-ID if it's a non-empty UUID (not empty string or stale value)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (lastTenantId && uuidRegex.test(lastTenantId)) {
      config.headers['X-Tenant-ID'] = lastTenantId;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Attempt token refresh on 401 (except for auth endpoints and if already retried)
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/')
    ) {
      originalRequest._retry = true;

      try {
        // Use a shared promise to prevent concurrent refresh calls (race condition fix)
        if (!refreshPromise) {
          refreshPromise = axios.post(
            `${apiClient.defaults.baseURL}/auth/refresh/`,
            {},
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY)}`,
              },
            }
          ).then((r) => r.data?.access_token).finally(() => { refreshPromise = null; });
        }
        const newToken = await refreshPromise;
        if (newToken) {
          // Determine which storage originally held the token and write back there only
          const wasInLocalStorage = !!localStorage.getItem(TOKEN_STORAGE_KEY);
          const wasInSessionStorage = !!sessionStorage.getItem(TOKEN_STORAGE_KEY);

          if (wasInLocalStorage) {
            localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
          }
          if (wasInSessionStorage) {
            sessionStorage.setItem(TOKEN_STORAGE_KEY, newToken);
          }
          // If neither had it (edge case), default to sessionStorage to avoid leaking
          if (!wasInLocalStorage && !wasInSessionStorage) {
            sessionStorage.setItem(TOKEN_STORAGE_KEY, newToken);
          }

          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, proceed to logout
      }

      // Token refresh failed — clean up and dispatch event for React-side handling
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);

      // Determine the correct login page based on current URL
      // If we're on a /:slug/* path, redirect to /:slug/auth instead of /auth
      const currentPath = window.location.pathname;
      const tenantMatch = currentPath.match(/^\/([^/]+)\/.+/);
      const targetAuthPath = tenantMatch ? `/${tenantMatch[1]}/auth` : '/auth';
      if (currentPath !== targetAuthPath) {
        window.dispatchEvent(new CustomEvent('auth:logout', { detail: { redirectPath: targetAuthPath } }));
      }
    }

    if (error.response?.status === 404 && error.config?.url?.includes('/tenants/')) {
      console.warn('Tenant request failed with 404, clearing last_tenant_id...');
      localStorage.removeItem('last_tenant_id');
    }

    return Promise.reject(error);
  },
);

export { TOKEN_STORAGE_KEY };
export default apiClient;
