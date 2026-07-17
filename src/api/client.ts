import axios from 'axios';

const TOKEN_STORAGE_KEY = 'schoolflow:access_token';

/** Timeout global toutes requêtes API : 15 secondes. */
const API_TIMEOUT_MS = 15_000;

/** Codes HTTP transitoires qui méritent un retry automatique. */
const RETRYABLE_STATUS_CODES = [502, 503, 504];
const MAX_AUTO_RETRIES = 2;

// Mutex for token refresh — prevents concurrent refresh calls
let refreshPromise: Promise<string> | null = null;

function isLocalHost(value: string): boolean {
  return /localhost|127\.0\.0\.1/.test(value);
}

function isRelativeUrl(value: string): boolean {
  return value.startsWith('/');
}

/**
 * In Docker/nginx, the frontend is exposed on a local host port such as 3000/3001
 * and nginx proxies /api/ to the API container. A runtime config or stale build
 * that points to http://localhost (without the frontend port) makes the browser
 * call port 80 and causes ERR_CONNECTION_REFUSED. Normalize that case to /api.
 */
function shouldUseDockerProxyForLocalhost(apiUrl: string): boolean {
  if (!isLocalHost(apiUrl) || isRelativeUrl(apiUrl)) return false;

  try {
    const parsed = new URL(apiUrl);
    const appPort = window.location.port;
    const apiPort = parsed.port;

    // Browser is on http://localhost:3000/3001/etc., but API_URL is
    // http://localhost or http://localhost:80. That bypasses nginx.
    if (appPort && (!apiPort || apiPort === '80')) return true;

    // In production builds served by nginx, local API calls must go through /api.
    if (!import.meta.env.DEV && isLocalHost(parsed.hostname)) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Réduit le `detail` d'une erreur API à une chaîne affichable.
 *
 * FastAPI renvoie une chaîne pour les HTTPException, mais un TABLEAU d'objets
 * `{type, loc, msg, input, ctx}` pour les erreurs de validation (422). Les
 * composants font `toast(err.response?.data?.detail || '…')` : sans cette
 * normalisation, l'objet part dans React qui lève l'erreur #31 et l'app plante.
 */
export function normalizeApiDetail(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (typeof detail === 'string') return detail;

  const messageOf = (item: unknown): string => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const e = item as { msg?: unknown; loc?: unknown };
      const msg = typeof e.msg === 'string' ? e.msg : '';
      // loc = ["body", "academic_year_id"] → on garde le nom du champ.
      const field = Array.isArray(e.loc)
        ? e.loc.filter((p) => typeof p === 'string' && p !== 'body' && p !== 'query').pop()
        : undefined;
      if (msg && field) return `${field} : ${msg}`;
      if (msg) return msg;
    }
    return '';
  };

  const parts = (Array.isArray(detail) ? detail : [detail]).map(messageOf).filter(Boolean);
  if (parts.length) return parts.join(' — ');

  // Objet inattendu : ne jamais retourner l'objet lui-même (crash React).
  try {
    return JSON.stringify(detail);
  } catch {
    return undefined;
  }
}

function sanitizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return '';

  if (shouldUseDockerProxyForLocalhost(trimmed)) {
    return '/api';
  }

  return trimmed;
}

/**
 * Resolve the API base URL using this priority:
 *
 * 1. Runtime config  (window.__SCHOOLFLOW_CONFIG__.API_URL)
 *    → Set in dist/config.js on the server AFTER build.
 *      Supports any hosting (Render, Netlify, S3, Nginx…).
 *
 * 2. Build-time env  (VITE_API_URL)
 *    → Baked in at `npm run build`. Good for Docker / single-env deploys.
 *
 * 3. Sensible defaults
 *    → /api in production builds so Docker/nginx proxy is always used,
 *      http://localhost:8000 only for local Vite dev server.
 */
function resolveApiBaseUrl(rawValue?: string): string {
  // ── Priority 1: runtime config (editable without rebuild) ─────────────
  const runtimeCfg = (window as any).__SCHOOLFLOW_CONFIG__;
  if (runtimeCfg?.API_URL && typeof runtimeCfg.API_URL === 'string') {
    const runtimeUrl = sanitizeApiBaseUrl(runtimeCfg.API_URL);
    if (runtimeUrl) {
      return runtimeUrl;
    }
  }

  // ── Priority 2: build-time env var ────────────────────────────────────
  const trimmed = rawValue ? sanitizeApiBaseUrl(rawValue) : '';
  if (trimmed) {
    const isBrowserLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
    if (!isBrowserLocal && isLocalHost(trimmed)) {
      // Build-time URL points to localhost but browser is remote → use proxy
      return '/api-proxy';
    }
    return trimmed;
  }

  // ── Priority 3: defaults ──────────────────────────────────────────────
  if (import.meta.env.DEV) {
    return 'http://localhost:8000';
  }

  return '/api';
}

export const apiClient = axios.create({
  baseURL: `${resolveApiBaseUrl(import.meta.env.VITE_API_URL)}/api/v1`,
  timeout: API_TIMEOUT_MS,
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
    const originalRequest = error.config as typeof error.config & {
      _retry?: boolean;
      _retryCount?: number;
    };

    // Retry automatique sur erreurs serveur transitoires (502, 503, 504)
    const httpStatus = error.response?.status;
    if (httpStatus && RETRYABLE_STATUS_CODES.includes(httpStatus) && originalRequest) {
      const retryCount = originalRequest._retryCount ?? 0;
      if (retryCount < MAX_AUTO_RETRIES) {
        originalRequest._retryCount = retryCount + 1;
        const delay = 500 * (retryCount + 1); // 500ms, 1000ms
        await new Promise((r) => setTimeout(r, delay));
        return apiClient(originalRequest);
      }
    }

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
                'X-Tenant-ID': localStorage.getItem('last_tenant_id') || '',
              },
            }
          ).then((r) => r.data?.access_token).finally(() => { refreshPromise = null; });
        }
        const newToken = await refreshPromise;
        if (!newToken) {
          if (import.meta.env.DEV) console.warn('[Auth] Token refresh returned no access_token');
        }
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
      if (import.meta.env.DEV) console.warn('[API] Tenant 404 — clearing last_tenant_id');
      localStorage.removeItem('last_tenant_id');
    }

    // Normalise `detail` en CHAÎNE avant de rejeter.
    // FastAPI/Pydantic renvoie sur 422 un tableau d'objets
    // ({type, loc, msg, input, ctx}). ~140 endroits font
    // `toast(err.response?.data?.detail || '...')` : passer l'objet à React
    // lève « Objects are not valid as a React child » (erreur #31) et fait
    // planter toute l'application au lieu d'afficher l'erreur de saisie.
    if (error.response?.data) {
      error.response.data.detail = normalizeApiDetail(error.response.data.detail);
    }

    return Promise.reject(error);
  },
);

export { TOKEN_STORAGE_KEY };
export default apiClient;
