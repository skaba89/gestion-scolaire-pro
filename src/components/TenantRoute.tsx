import { useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { Skeleton } from "@/components/ui/skeleton";

export function TenantRoute({ children }: { children: React.ReactNode }) {
    const { tenantSlug } = useParams<{ tenantSlug: string }>();
    const { fetchTenantBySlug, tenant, isLoading } = useTenant();

    useEffect(() => {
        if (tenantSlug && (!tenant || tenant.slug !== tenantSlug)) {
            fetchTenantBySlug(tenantSlug);
        }
    }, [tenantSlug, tenant, fetchTenantBySlug]);

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

    if (!tenant || tenant.slug !== tenantSlug) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
