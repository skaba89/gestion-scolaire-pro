import axios from 'axios';

const TOKEN_STORAGE_KEY = 'schoolflow:access_token';

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
      console.error('JWT token invalid or expired, cleaning up session...');
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);

      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
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
