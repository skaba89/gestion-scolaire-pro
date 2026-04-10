import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { TwoFactorChallenge } from "@/components/auth/TwoFactorChallenge";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { AppRole } from "@/lib/types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

const DEBUG_ROUTE_GUARDS = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROUTE_DEBUG === "true";

function routeDebug(...args: unknown[]) {
  if (DEBUG_ROUTE_GUARDS) {
    console.log("[RouteGuard]", ...args);
  }
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const {
    user,
    isLoading,
    roles,
    hasRole,
    mustChangePassword,
    tenant: authTenant,
    isMfaVerified,
  } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationRef = useRef<string | null>(null);

  // Use refs for tenant values to avoid re-triggering navigation on tenant state changes
  const tenantRef = useRef(tenant);
  const authTenantRef = useRef(authTenant);
  useEffect(() => {
    tenantRef.current = tenant;
    authTenantRef.current = authTenant;
  }, [tenant, authTenant]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const navigationKey = `${location.pathname}-${user?.id || "no-user"}-${roles.join(",")}-${mustChangePassword}`;
    if (navigationRef.current === navigationKey) {
      return;
    }

    if (!user) {
      const from = `${location.pathname}${location.search}${location.hash}`;
      routeDebug("Redirecting unauthenticated user to /auth", from);
      navigationRef.current = navigationKey;
      navigate("/auth", { state: { from }, replace: true });
      return;
    }

    if (mustChangePassword && location.pathname !== "/change-password") {
      routeDebug("Redirecting user to /change-password");
      navigationRef.current = navigationKey;
      navigate("/change-password", { replace: true });
      return;
    }

    if (allowedRoles && allowedRoles.length > 0) {
      // If user has no roles at all, redirect to auth — something is wrong
      if (roles.length === 0) {
        routeDebug("No roles found, redirecting to /auth");
        navigationRef.current = navigationKey;
        navigate("/auth", { state: { from: `${location.pathname}${location.search}${location.hash}` } }, { replace: true });
        return;
      }
      const hasAllowedRole = allowedRoles.some((role) => hasRole(role));
      if (!hasAllowedRole) {
        const effectiveTenant = tenantRef.current || authTenantRef.current;
        const redirectPath = getRedirectPathForRoles(roles, effectiveTenant?.slug);
        routeDebug("Access denied, redirecting", {
          allowedRoles,
          roles,
          redirectPath,
        });
        navigationRef.current = navigationKey;
        navigate(redirectPath, { replace: true });
      }
    }
  }, [
    user,
    isLoading,
    roles,
    allowedRoles,
    navigate,
    location.pathname,
    location.search,
    location.hash,
    hasRole,
    mustChangePassword,
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (mustChangePassword && location.pathname !== "/change-password") {
    return null;
  }

  if (!isMfaVerified) {
    return <TwoFactorChallenge onSuccess={() => undefined} />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    if (roles.length === 0) {
      return null;
    }
    const hasAllowedRole = allowedRoles.some((role) => hasRole(role));
    if (!hasAllowedRole) {
      return null;
    }
  }

  return <>{children}</>;
};

export const getRedirectPathForRoles = (roles: AppRole[], tenantSlug?: string | null): string => {
  const businessRoles = roles.filter((role) =>
    [
      "SUPER_ADMIN",
      "TENANT_ADMIN",
      "DIRECTOR",
      "DEPARTMENT_HEAD",
      "TEACHER",
      "PARENT",
      "STUDENT",
      "ACCOUNTANT",
      "STAFF",
    ].includes(role),
  );

  if (businessRoles.length === 0) {
    return "/";
  }

  // SUPER_ADMIN always goes to the platform dashboard regardless of tenant
  if (businessRoles.includes("SUPER_ADMIN" as AppRole)) {
    return "/super-admin";
  }

  const prefix = tenantSlug ? `/${tenantSlug}` : "";

  if (
    businessRoles.includes("TENANT_ADMIN") ||
    businessRoles.includes("DIRECTOR") ||
    businessRoles.includes("ACCOUNTANT")
  ) {
    return `${prefix}/admin`;
  }
  if (businessRoles.includes("DEPARTMENT_HEAD" as AppRole)) {
    return `${prefix}/department`;
  }
  if (businessRoles.includes("TEACHER")) {
    return `${prefix}/teacher`;
  }
  if (businessRoles.includes("PARENT")) {
    return `${prefix}/parent`;
  }
  if (businessRoles.includes("STUDENT")) {
    return `${prefix}/student`;
  }
  if (businessRoles.includes("ALUMNI" as AppRole)) {
    return `${prefix}/alumni`;
  }
  if (businessRoles.includes("STAFF")) {
    return `${prefix}/admin`;
  }

  return "/";
};
