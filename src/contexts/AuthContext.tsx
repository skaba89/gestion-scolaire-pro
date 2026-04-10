import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, TOKEN_STORAGE_KEY } from "@/api/client";
import type { AppRole, Profile, Tenant } from "@/lib/types";

type AuthenticatedUser = {
  id: string;
  email?: string;
  metadata: Record<string, unknown>;
  audience: string;
  createdAt: string;
};

type AuthContextType = {
  user: AuthenticatedUser | null;
  session: null;
  profile: Profile | null;
  roles: AppRole[];
  tenant: Tenant | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  isMfaVerified: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; profileData?: any }>;
  verifyMfa: (token: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, metadata?: unknown) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  signOutAllDevices: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAuthenticatedUser(user: { id: string; email?: string }): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    metadata: {},
    audience: "authenticated",
    createdAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isMfaVerified, setIsMfaVerified] = useState(false);

  const clearAuth = useCallback(() => {
    setUser(null);
    setProfile(null);
    setRoles([]);
    setTenant(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const applyProfileData = useCallback((data: any) => {
    setUser(data.user ? toAuthenticatedUser(data.user) : null);
    setRoles((data.roles || []) as AppRole[]);
    setTenant((data.tenant || null) as Tenant | null);

    // Read must_change_password from profile or user metadata
    const needsPasswordChange = data.profile?.must_change_password
      || data.user?.must_change_password
      || data.must_change_password
      || false;
    setMustChangePassword(!!needsPasswordChange);

    // MFA verified state — defaults false, set true only after explicit verification
    // The backend can signal MFA requirement via user.mfa_enabled
    if (!data.user?.mfa_enabled) {
      setIsMfaVerified(true); // No MFA required, so considered verified
    }
    // If MFA is enabled, isMfaVerified stays false until verifyMfa() is called

    if (data.profile && data.user) {
      setProfile({
        id: data.user.id,
        tenant_id: data.tenant?.id,
        email: data.user.email,
        first_name: data.profile.first_name,
        last_name: data.profile.last_name,
        avatar_url: data.profile.avatar_url,
        is_current: true,
        created_at: data.profile.created_at || data.user.created_at || new Date().toISOString(),
        updated_at: data.profile.updated_at || new Date().toISOString(),
      });
    } else {
      setProfile(null);
    }

    if (data.tenant?.id) {
      localStorage.setItem("last_tenant_id", data.tenant.id);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      clearAuth();
      return;
    }

    try {
      const response = await apiClient.get("/users/me/");
      applyProfileData(response.data);
    } catch (error) {
      console.error("Profile refresh failed", error);
      clearAuth();
    }
  }, [applyProfileData, clearAuth]);

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true);
      try {
        await refreshProfile();
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, [refreshProfile]);

  // Listen for auth:logout events from the API interceptor (outside React tree)
  useEffect(() => {
    const handleAuthLogout = () => {
      clearAuth();
      navigate('/auth', { replace: true });
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, [clearAuth, navigate]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const body = new URLSearchParams();
      body.set("username", email);
      body.set("password", password);
      const response = await apiClient.post("/auth/login/", body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const token = response.data?.access_token;
      if (!token) {
        throw new Error("No access token returned by API");
      }
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      const profileResponse = await apiClient.get("/users/me/");
      applyProfileData(profileResponse.data);
      return { error: null, profileData: profileResponse.data };
    } catch (error) {
      clearAuth();
      return { error: error instanceof Error ? error : new Error("Authentication failed") };
    } finally {
      setIsLoading(false);
    }
  }, [clearAuth, applyProfileData]);

  const signUp = useCallback(async (email: string, password: string, metadata?: unknown) => {
    try {
      await apiClient.post('/auth/register/', { email, password, ...(metadata && typeof metadata === 'object' ? metadata : {}) });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error("Registration failed") };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout/");
    } catch {
      // Server logout failed, continue with local cleanup
    }
    clearAuth();
  }, [clearAuth]);

  const refreshToken = useCallback(async () => {
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (!token) return false;

      const response = await apiClient.post("/auth/refresh/");
      const newToken = response.data?.access_token;
      if (newToken) {
        localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
        return true;
      }
      return false;
    } catch {
      clearAuth();
      return false;
    }
  }, [clearAuth]);

  const signOutAllDevices = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout-all/");
    } catch {
      // Server call failed, still clear local state
    }
    clearAuth();
  }, [clearAuth]);

  const verifyMfa = useCallback(async (token: string) => {
    try {
      await apiClient.post('/mfa/otp/verify/', { code: token });
      setIsMfaVerified(true);
      return { success: true };
    } catch {
      return { success: false, error: 'Code invalide' };
    }
  }, []);
  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);
  const isAdmin = useCallback(
    () => roles.some((role) => ["SUPER_ADMIN", "TENANT_ADMIN", "DIRECTOR"].includes(role)),
    [roles],
  );
  const isSuperAdmin = useCallback(() => roles.includes("SUPER_ADMIN"), [roles]);

  const value = useMemo(
    () => ({
      user,
      session: null,
      profile,
      roles,
      tenant,
      isLoading,
      mustChangePassword,
      isMfaVerified,
      signIn,
      verifyMfa,
      signUp,
      signOut,
      refreshToken,
      signOutAllDevices,
      hasRole,
      isAdmin,
      isSuperAdmin,
      refreshProfile,
    }),
    [
      user,
      profile,
      roles,
      tenant,
      isLoading,
      mustChangePassword,
      isMfaVerified,
      signIn,
      verifyMfa,
      signUp,
      signOut,
      refreshToken,
      signOutAllDevices,
      hasRole,
      isAdmin,
      isSuperAdmin,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
