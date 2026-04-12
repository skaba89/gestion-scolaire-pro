import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { usePublicTenant } from "@/hooks/usePublicTenant";
import { Skeleton } from "@/components/ui/skeleton";

export function TenantRoute({ children }: { children: React.ReactNode }) {
    const { tenantSlug } = useParams<{ tenantSlug: string }>();
    const { tenant, isLoading: tenantCtxLoading, setCurrentTenant } = useTenant();
    const { data: publicTenant, isLoading: publicLoading } = usePublicTenant(tenantSlug);
    const [synced, setSynced] = useState(false);

    // Use the public tenant data to populate the tenant context
    // This avoids needing authentication to resolve the slug
    useEffect(() => {
        if (publicTenant && (!tenant || tenant.slug !== publicTenant.slug)) {
            setCurrentTenant(publicTenant as any);
            setSynced(true);
        } else if (tenant && tenant.slug === tenantSlug) {
            setSynced(true);
        }
    }, [publicTenant, tenant, tenantSlug, setCurrentTenant]);

    const isLoading = tenantCtxLoading || publicLoading;

    // Show loading while resolving tenant
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="space-y-4 w-full max-w-md p-8">
                    <Skeleton className="h-8 w-3/4 mx-auto" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-32 w-full" />
                </div>
            </div>
        );
    }

    // If no tenant found, redirect to the tenant's login page instead of /
    if (!synced || (!tenant && !publicTenant) || (tenant && tenant.slug !== tenantSlug && !publicTenant)) {
        // Redirect to tenant login, not to root
        return <Navigate to={tenantSlug ? `/${tenantSlug}/auth` : "/"} replace />;
    }

    return <>{children}</>;
}
