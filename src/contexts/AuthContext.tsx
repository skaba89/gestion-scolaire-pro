import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AuthProvider as OIDCProvider, useAuth as useOIDCAuth } from "react-oidc-context";
import type { User } from "oidc-client-ts";

import { apiClient } from "@/api/client";
import type { AppRole, Profile, Tenant } from "@/lib/types";

interface AuthenticatedUser {
  id: string;
  email?: string;
  metadata: Record<string, unknown>;
  audience: string;
  createdAt: string;
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  session: User | null;
  profile: Profile | null;
  roles: AppRole[];
  tenant: Tenant | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  isMfaVerified: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithKeycloak: () => Promise<{ error: Error | null }>;
  verifyMfa: (token: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, metadata?: unknown) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  signOutAllDevices: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_RETURN_TO_KEY = "schoolflow:return_to";
const DEBUG_AUTH = import.meta.env.DEV || import.meta.env.VITE_ENABLE_AUTH_DEBUG === "true";

function authDebug(...args: unknown[]) {
  if (DEBUG_AUTH) {
    console.log("[Auth]", ...args);
  }
}

function isLocalHost(value: string): boolean {
  return /localhost|127\.0\.0\.1/.test(value);
}

function resolveKeycloakAuthority(rawValue?: string): string {
  const trimmed = rawValue?.trim();
  const isBrowserLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);

  let base = trimmed;
  if (!base) {
    base = isBrowserLocal ? "http://localhost:8080" : "/keycloak";
  } else if (!isBrowserLocal && isLocalHost(base)) {
    base = "/keycloak";
  }

  if (base.startsWith("/")) {
    return `${window.location.origin}${base}`.replace(/\/$/, "");
  }

  return base.replace(/\/$/, "");
}

const KEYCLOAK_AUTHORITY = resolveKeycloakAuthority(import.meta.env.VITE_KEYCLOAK_URL);

const oidcConfig = {
  authority: `${KEYCLOAK_AUTHORITY}/realms/${import.meta.env.VITE_KEYCLOAK_REALM}`,
  client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: window.location.origin,
  automaticSilentRenew: true,
  onSigninCallback: () => {
    const returnTo = window.sessionStorage.getItem(AUTH_RETURN_TO_KEY);
    const targetPath = returnTo || window.location.pathname || "/";
    window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
    window.history.replaceState({}, document.title, targetPath);
  },
};

function toAuthenticatedUser(user: { id: string; email?: string } | User["profile"]): AuthenticatedUser {
  return {
    id: ("id" in user ? user.id : user.sub) || "",
    email: "email" in user ? user.email : user.email,
    metadata: {},
    audience: "authenticated",
    createdAt: new Date().toISOString(),
  };
}

function extractRealmRoles(user: User | null): AppRole[] {
  const tokenRoles = (user?.profile as Record<string, unknown> | undefined)?.realm_access as
    | { roles?: string[] }
    | undefined;

  return (tokenRoles?.roles || []).filter((role): role is AppRole =>
    [
      "SUPER_ADMIN",
      "TENANT_ADMIN",
      "DIRECTOR",
      "DEPARTMENT_HEAD",
      "TEACHER",
      "STUDENT",
      "PARENT",
      "ACCOUNTANT",
      "STAFF",
    ].includes(role),
  );
}

function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const auth = useOIDCAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [appUser, setAppUser] = useState<AuthenticatedUser | null>(null);

  useEffect(() => {
    if (auth.isAuthenticated && auth.user) {
      authDebug("Authenticated, fetching profile from API");
      apiClient
        .get("/users/me/")
        .then((response) => {
          const data = response.data;

          if (data.user) {
            setAppUser(toAuthenticatedUser(data.user));
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
              updated_at: new Date().toISOString(),
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
        })
        .catch((error) => {
          console.error("Failed to fetch user profile from API", error);
          setRoles(extractRealmRoles(auth.user));
          setAppUser(toAuthenticatedUser(auth.user.profile));
        });
    } else {
      setAppUser(null);
      setProfile(null);
      setRoles([]);
      setTenant(null);
    }
  }, [auth.isAuthenticated, auth.user]);

  const refreshProfile = useCallback(async () => {
    if (!auth.isAuthenticated || !auth.user) {
      return;
    }

    try {
      authDebug("Refreshing profile from API");
      const response = await apiClient.get("/users/me/");
      const data = response.data;

      if (data.user) {
        setAppUser(toAuthenticatedUser(data.user));
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
          updated_at: new Date().toISOString(),
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
    } catch (error) {
      console.error("Manual profile refresh failed", error);
    }
  }, [auth.isAuthenticated, auth.user]);

  const rememberCurrentPath = useCallback(() => {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, currentPath || "/");
  }, []);

  const signIn = useCallback(async () => {
    rememberCurrentPath();
    await auth.signinRedirect();
    return { error: null };
  }, [auth, rememberCurrentPath]);

  const signInWithKeycloak = useCallback(async () => {
    rememberCurrentPath();
    await auth.signinRedirect();
    return { error: null };
  }, [auth, rememberCurrentPath]);

  const signUp = useCallback(async () => {
    rememberCurrentPath();
    await auth.signinRedirect({
      extraQueryParams: { kc_action: "register" },
    });
    return { error: null };
  }, [auth, rememberCurrentPath]);

  const signOut = useCallback(async () => {
    await auth.signoutRedirect({
      post_logout_redirect_uri: window.location.origin,
    });
  }, [auth]);

  const signOutAllDevices = useCallback(async () => {
    await auth.signoutRedirect({
      post_logout_redirect_uri: window.location.origin,
    });
  }, [auth]);

  const verifyMfa = useCallback(async () => {
    return { success: auth.isAuthenticated };
  }, [auth.isAuthenticated]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);
  const isAdmin = useCallback(
    () => roles.some((role) => ["SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR"].includes(role)),
    [roles],
  );
  const isSuperAdmin = useCallback(() => roles.includes("SUPER_ADMIN"), [roles]);

  const contextValue = useMemo(
    () => ({
      user: appUser,
      session: auth.user ?? null,
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
      refreshProfile,
    }),
    [
      appUser,
      auth.user,
      profile,
      roles,
      tenant,
      auth.isLoading,
      signIn,
      signInWithKeycloak,
      verifyMfa,
      signUp,
      signOut,
      signOutAllDevices,
      hasRole,
      isAdmin,
      isSuperAdmin,
      refreshProfile,
    ],
  );

  if (auth.isLoading) {
    return <div>Loading Auth...</div>;
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
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
