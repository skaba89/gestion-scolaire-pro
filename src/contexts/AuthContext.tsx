import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { AuthProvider as OIDCProvider, useAuth as useOIDCAuth } from "react-oidc-context";
import { User } from "oidc-client-ts";
import { apiClient } from "@/api/client";
import type { Profile, Tenant, AppRole } from "@/lib/types";
import { toast } from "sonner";

// Compatible User interface (minimal)
interface SupabaseUserShape {
  id: string;
  email?: string;
  app_metadata: any;
  user_metadata: any;
  aud: string;
  created_at: string;
}

interface AuthContextType {
  user: SupabaseUserShape | null;
  session: any | null; // Placeholder for compatibility
  profile: Profile | null;
  roles: AppRole[];
  tenant: Tenant | null;
  isLoading: boolean;
  mustChangePassword: boolean; // Managed by Keycloak usually
  isMfaVerified: boolean; // Managed by Keycloak
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithKeycloak: () => Promise<{ error: Error | null }>;
  verifyMfa: (token: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, metadata?: any) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  signOutAllDevices: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const oidcConfig = {
  authority: import.meta.env.VITE_KEYCLOAK_URL + "/realms/" + import.meta.env.VITE_KEYCLOAK_REALM,
  client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: window.location.origin,
  automaticSilentRenew: true,
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
};

console.log("OIDC Configuration:", oidcConfig);

function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const auth = useOIDCAuth();
  console.log("AuthStateProvider rendering, auth.isLoading:", auth.isLoading, "auth.isAuthenticated:", auth.isAuthenticated);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [dbUser, setDbUser] = useState<SupabaseUserShape | null>(null);

  useEffect(() => {
    if (auth.isAuthenticated && auth.user) {
      // Fetch full profile from sovereign API
      apiClient.get('/users/me/')
        .then(response => {
          const data = response.data;

          if (data.user) {
            console.log("Auth: DB user info received:", data.user.id);
            setDbUser({
              id: data.user.id,
              email: data.user.email,
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
              created_at: new Date().toISOString()
            });
          }

          if (data.profile) {
            console.log("Auth: Profile info received:", data.profile);
            setProfile({
              id: data.user.id,
              tenant_id: data.tenant?.id,
              email: data.user.email,
              first_name: data.profile.first_name,
              last_name: data.profile.last_name,
              avatar_url: data.profile.avatar_url,
              is_current: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }

          if (data.roles) {
            console.log("Auth: Roles received:", data.roles);
            setRoles(data.roles as AppRole[]);
          }

          if (data.tenant) {
            console.log("Auth: Tenant received:", data.tenant.slug);
            setTenant(data.tenant as Tenant);
          }
        })
        .catch(err => {
          console.error("Failed to fetch user profile from API", err);
          // Fallback to token claims if API is unavailable
          const tokenRoles = (auth.user?.profile as any).realm_access?.roles || [];
          const appRoles: AppRole[] = tokenRoles.filter((r: string) =>
            ["SUPER_ADMIN", "TENANT_ADMIN", "TEACHER", "STUDENT", "PARENT", "DIRECTOR"].includes(r)
          );
          setRoles(appRoles);

          setDbUser({
            id: auth.user!.profile.sub,
            email: auth.user!.profile.email,
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
            created_at: new Date().toISOString()
          });
        });
    } else {
      setDbUser(null);
      setProfile(null);
      setRoles([]);
      setTenant(null);
    }
  }, [auth.isAuthenticated, auth.user]);

  const refreshProfile = useCallback(async () => {
    if (!auth.isAuthenticated || !auth.user) return;

    try {
      console.log("Auth: Manually refreshing profile from sovereign API...");
      const response = await apiClient.get('/users/me/');
      const data = response.data;

      if (data.user) {
        setDbUser({
          id: data.user.id,
          email: data.user.email,
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString()
        });
      }

      if (data.profile) {
        setProfile({
          id: data.user.id,
          tenant_id: data.tenant?.id,
          email: data.user.email,
          first_name: data.profile.first_name,
          last_name: data.profile.last_name,
          avatar_url: data.profile.avatar_url,
          is_current: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      if (data.roles) {
        setRoles(data.roles as AppRole[]);
      }

      if (data.tenant) {
        setTenant(data.tenant as Tenant);
        if (data.tenant.id) {
          localStorage.setItem("last_tenant_id", data.tenant.id);
        }
      }
    } catch (err) {
      console.error("Manual profile refresh failed", err);
    }
  }, [auth.isAuthenticated, auth.user]);

  const signIn = useCallback(async () => {
    await auth.signinRedirect();
    return { error: null };
  }, [auth]);

  const signInWithKeycloak = useCallback(async () => {
    await auth.signinRedirect();
    return { error: null };
  }, [auth]);

  const signUp = useCallback(async () => {
    // Redirection to registration page if enabled in Keycloak
    await auth.signinRedirect({
      extraQueryParams: { kc_idp_hint: '' }
    });
    return { error: null };
  }, [auth]);

  const signOut = useCallback(async () => {
    // Standard OIDC logout
    await auth.signoutRedirect();
  }, [auth]);

  const signOutAllDevices = useCallback(async () => {
    await auth.signoutRedirect();
  }, [auth]);

  const verifyMfa = useCallback(async () => {
    // Keycloak handles MFA, so we just return success if we are authenticated
    return { success: auth.isAuthenticated };
  }, [auth.isAuthenticated]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);
  const isAdmin = useCallback(() => roles.some(r => ["SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR"].includes(r)), [roles]);
  const isSuperAdmin = useCallback(() => roles.includes("SUPER_ADMIN"), [roles]);

  const contextValue = useMemo(() => ({
    user: dbUser,
    session: auth.user,
    profile,
    roles,
    tenant,
    isLoading: auth.isLoading,
    mustChangePassword: false,
    isMfaVerified: true,
    signIn,
    signInWithKeycloak,
    verifyMfa,
    signUp,
    signOut,
    signOutAllDevices,
    hasRole,
    isAdmin,
    isSuperAdmin,
    refreshProfile
  }), [dbUser, auth.user, profile, roles, tenant, auth.isLoading, signIn, signInWithKeycloak, verifyMfa, signUp, signOut, signOutAllDevices, hasRole, isAdmin, isSuperAdmin, refreshProfile]);

  if (auth.isLoading) {
    return <div>Loading Auth...</div>;
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <OIDCProvider {...oidcConfig}>
      <AuthStateProvider>{children}</AuthStateProvider>
    </OIDCProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
