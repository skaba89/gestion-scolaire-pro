import axios from 'axios';
import { User } from 'oidc-client-ts';

function isLocalHost(value: string): boolean {
  return /localhost|127\.0\.0\.1/.test(value);
}

function resolveApiBaseUrl(rawValue?: string): string {
  const trimmed = rawValue?.trim();
  const isBrowserLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);

  if (trimmed) {
    if (!isBrowserLocal && isLocalHost(trimmed)) {
      return '/api-proxy';
    }
    return trimmed;
  }

  return isBrowserLocal ? 'http://localhost:8000' : '/api-proxy';
}

function resolveKeycloakAuthority(rawValue?: string): string {
  const trimmed = rawValue?.trim();
  const isBrowserLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);

  let base = trimmed;
  if (!base) {
    base = isBrowserLocal ? 'http://localhost:8080' : '/keycloak';
  } else if (!isBrowserLocal && isLocalHost(base)) {
    base = '/keycloak';
  }

  if (base.startsWith('/')) {
    return `${window.location.origin}${base}`.replace(/\/$/, '');
  }

  return base.replace(/\/$/, '');
}

const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const KEYCLOAK_AUTHORITY = resolveKeycloakAuthority(import.meta.env.VITE_KEYCLOAK_URL);
const OIDC_STORAGE_KEY = `oidc.user:${KEYCLOAK_AUTHORITY}/realms/${import.meta.env.VITE_KEYCLOAK_REALM}:${import.meta.env.VITE_KEYCLOAK_CLIENT_ID}`;

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const oidcStorage = sessionStorage.getItem(OIDC_STORAGE_KEY);
    if (oidcStorage) {
      const user = User.fromStorageString(oidcStorage);
      if (user && user.access_token) {
        config.headers.Authorization = `Bearer ${user.access_token}`;
      }
    }

    const lastTenantId = localStorage.getItem('last_tenant_id');
    if (lastTenantId) {
      config.headers['X-Tenant-ID'] = lastTenantId;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('JWT Token expired or invalid, cleaning up session...');
      sessionStorage.removeItem(OIDC_STORAGE_KEY);
      window.location.href = '/';
    }

    if (error.response?.status === 404 && error.config?.url?.includes('/tenants/')) {
      console.warn('Tenant request failed with 404, clearing last_tenant_id...');
      localStorage.removeItem('last_tenant_id');
    }

    return Promise.reject(error);
  },
);

export default apiClient;
