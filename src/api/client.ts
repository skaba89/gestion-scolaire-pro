import axios from 'axios';
import { User } from 'oidc-client-ts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
    baseURL: `${API_URL}/api/v1`,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to add Bearer token
apiClient.interceptors.request.use(
    (config) => {
        const oidcStorage = sessionStorage.getItem(`oidc.user:${import.meta.env.VITE_KEYCLOAK_URL}/realms/${import.meta.env.VITE_KEYCLOAK_REALM}:${import.meta.env.VITE_KEYCLOAK_CLIENT_ID}`);
        if (oidcStorage) {
            const user = User.fromStorageString(oidcStorage);
            if (user && user.access_token) {
                config.headers.Authorization = `Bearer ${user.access_token}`;
            }
        }

        // Add Tenant ID header if available
        const lastTenantId = localStorage.getItem("last_tenant_id");
        if (lastTenantId) {
            config.headers['X-Tenant-ID'] = lastTenantId;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

// Interceptor to handle 401 Unauthorized responses
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            console.error("JWT Token expired or invalid, cleaning up session...");
            const oidcKey = `oidc.user:${import.meta.env.VITE_KEYCLOAK_URL}/realms/${import.meta.env.VITE_KEYCLOAK_REALM}:${import.meta.env.VITE_KEYCLOAK_CLIENT_ID}`;
            sessionStorage.removeItem(oidcKey);
            // Reload page so that react-oidc-context initiates a new login flow
            window.location.href = "/";
        }

        if (error.response?.status === 404 && error.config?.url?.includes('/tenants/')) {
            console.warn("Tenant request failed with 404, clearing last_tenant_id...");
            localStorage.removeItem("last_tenant_id");
        }

        return Promise.reject(error);
    }
);

export default apiClient;
