import { useNavigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useCallback } from "react";

/**
 * Custom hook for tenant-aware navigation.
 * Automatically prepends the tenant slug to all navigation paths.
 * 
 * @example
 * const navigate = useTenantNavigate();
 * navigate('/admin/students'); // Navigates to /:tenantSlug/admin/students
 */
export function useTenantNavigate() {
    const navigate = useNavigate();
    const { tenant } = useTenant();

    const tenantNavigate = useCallback((path: string, options?: any) => {
        if (!tenant?.slug) {
            // If no tenant, navigate normally (fallback for edge cases)
            navigate(path, options);
            return;
        }

        // If the path already starts with the tenant slug, don't duplicate it
        if (path.startsWith(`/${tenant.slug}/`)) {
            navigate(path, options);
            return;
        }

        // If the path is absolute and doesn't need tenant context (e.g., /auth, /), navigate normally
        if (path === '/' || path.startsWith('/auth') || path.startsWith('/ecole/') || path.startsWith('/admissions/')) {
            navigate(path, options);
            return;
        }

        // Add the tenant slug to the beginning of the path
        const tenantPath = `/${tenant.slug}${path.startsWith('/') ? path : '/' + path}`;
        navigate(tenantPath, options);
    }, [navigate, tenant]);

    return tenantNavigate;
}
