import { useCallback } from "react";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Hook to generate tenant-aware URLs.
 * It automatically prefixes paths with the current tenant's slug.
 */
export function useTenantUrl() {
    const { tenant } = useTenant();

    const getTenantUrl = useCallback((path: string) => {
        if (!tenant?.slug) return path;

        // Ensure path starts with /
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;

        // If the path already includes the tenant slug at the start, don't duplicate it
        if (normalizedPath.startsWith(`/${tenant.slug}/`)) {
            return normalizedPath;
        }

        return `/${tenant.slug}${normalizedPath}`;
    }, [tenant?.slug]);

    return { getTenantUrl, tenantSlug: tenant?.slug };
}
