import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { AppRole } from "@/lib/types";
import { TwoFactorChallenge } from "@/components/auth/TwoFactorChallenge";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, isLoading, roles, hasRole, mustChangePassword, tenant: authTenant, isMfaVerified } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationRef = useRef<string | null>(null); // Prevent duplicate navigations

  useEffect(() => {
    if (isLoading) return;

    // Build a key to track current navigation context
    const navigationKey = `${location.pathname}-${user?.id || 'no-user'}-${roles.join(',')}`;

    // Prevent duplicate navigation to the same path with same context
    if (navigationRef.current === navigationKey) {
      return;
    }

    console.log("ProtectedRoute: Evaluating access for", location.pathname, "User:", !!user, "Loading:", isLoading);

    if (!user) {
      console.log("ProtectedRoute: No user, redirecting to /auth");
      navigationRef.current = navigationKey;
      navigate("/auth", { state: { from: location.pathname }, replace: true });
      return;
    }

    // Check if user must change password (and not already on change-password page)
    if (mustChangePassword && location.pathname !== "/change-password") {
      console.log("ProtectedRoute: mustChangePassword is true, redirecting");
      navigationRef.current = navigationKey;
      navigate("/change-password", { replace: true });
      return;
    }

    // Si des rôles spécifiques sont requis, vérifier
    if (allowedRoles && allowedRoles.length > 0) {
      const hasAllowedRole = allowedRoles.some((role) => hasRole(role));
      console.log("ProtectedRoute: Roles check:", { allowedRoles, userRoles: roles, hasAllowedRole });
      if (!hasAllowedRole && roles.length > 0) {
        // L'utilisateur a des rôles mais pas le bon - rediriger
        const effectiveTenant = tenant || authTenant;
        const redirectPath = getRedirectPathForRoles(roles, effectiveTenant?.slug);
        console.log("ProtectedRoute: Access denied, redirecting to", redirectPath);
        navigationRef.current = navigationKey;
        navigate(redirectPath, { replace: true });
      }
    }
  }, [user, isLoading, roles, allowedRoles, navigate, location.pathname, hasRole, mustChangePassword, tenant, authTenant]);

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

  // Redirect to change password if needed
  if (mustChangePassword && location.pathname !== "/change-password") {
    return null;
  }

  // Check 2FA
  if (!isMfaVerified) {
    return <TwoFactorChallenge onSuccess={() => { /* Context updates automatically */ }} />;
  }

  // Vérifier les rôles seulement si l'utilisateur a déjà des rôles
  if (allowedRoles && allowedRoles.length > 0 && roles.length > 0) {
    const hasAllowedRole = allowedRoles.some((role) => hasRole(role));
    if (!hasAllowedRole) {
      return null;
    }
  }

  return <>{children}</>;
};

export const getRedirectPathForRoles = (roles: AppRole[], tenantSlug?: string | null): string => {
  // Only consider business roles to avoid redirection loops with Keycloak defaults
  const businessRoles = roles.filter(role =>
    ["SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR", "DEPARTMENT_HEAD", "TEACHER", "PARENT", "STUDENT", "ACCOUNTANT", "STAFF"].includes(role)
  );

  if (businessRoles.length === 0) {
    return "/";
  }

  const prefix = tenantSlug ? `/${tenantSlug}` : "";

  if (businessRoles.includes("SUPER_ADMIN") || businessRoles.includes("TENANT_ADMIN") || businessRoles.includes("DIRECTOR") || businessRoles.includes("ACCOUNTANT")) {
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
