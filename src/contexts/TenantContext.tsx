import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tenant } from "@/lib/types";
import i18n from "@/i18n/config";

interface TenantContextType {
  currentTenant: Tenant | null;
  tenant: Tenant | null;
  allTenants: Tenant[];
  setCurrentTenant: (tenant: Tenant | null) => void;
  switchTenant: (tenantId: string) => Promise<void>;
  isLoading: boolean;
  fetchTenantBySlug: (slug: string) => Promise<Tenant | null>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

// Cache for tenant data to avoid redundant fetches
const tenantCache = new Map<string, { data: Tenant; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { profile, isLoading: authLoading, tenant: authTenant, isSuperAdmin } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualSelection, setIsManualSelection] = useState(false);

  // Fetch all tenants for Super Admin
  useEffect(() => {
    if (authLoading) return;

    if (isSuperAdmin()) {
      const fetchAllTenants = async () => {
        try {
          const response = await apiClient.get('/tenants');
          setAllTenants(response.data);
        } catch (error) {
          console.error("Error fetching all tenants:", error);
        }
      };
      fetchAllTenants();
    }
  }, [isSuperAdmin, authLoading]);

  // Use tenant from auth context if available (already fetched)
  useEffect(() => {
    if (authLoading) return;

    // If super admin has manually selected a tenant, don't auto-fetch their profile tenant
    if (isSuperAdmin() && isManualSelection) {
      setIsLoading(false);
      return;
    }

    // Check if we have a persisted last_tenant_id for super admin
    const lastTenantId = localStorage.getItem("last_tenant_id");
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (isSuperAdmin() && lastTenantId && uuidRegex.test(lastTenantId) && !isManualSelection) {
      const fetchLastTenant = async () => {
        setIsLoading(true);
        try {
          const response = await apiClient.get(`/tenants/${lastTenantId}`);
          if (response.data) {
            setCurrentTenant(response.data);
            setIsManualSelection(true);
          }
        } catch (err: any) {
          console.error("Error fetching last tenant", err);
          if (err.response?.status === 404) {
            localStorage.removeItem("last_tenant_id");
            setIsManualSelection(false);
          }
        } finally {
          setIsLoading(false);
        }
      };
      fetchLastTenant();
      return;
    }

    if (authTenant) {
      setCurrentTenant(authTenant);
      if (authTenant.id) {
        localStorage.setItem("last_tenant_id", authTenant.id);
      }
      setIsLoading(false);
      return;
    }

    if (!profile?.tenant_id) {
      if (!authTenant) {
        setCurrentTenant(null);
      }
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cached = tenantCache.get(profile.tenant_id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setCurrentTenant(cached.data);
      localStorage.setItem("last_tenant_id", profile.tenant_id);
      setIsLoading(false);
      return;
    }

    const fetchUserTenant = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.get(`/tenants/${profile.tenant_id}`);
        if (response.data) {
          const tenant = response.data;
          setCurrentTenant(tenant);
          localStorage.setItem("last_tenant_id", tenant.id);
          tenantCache.set(profile.tenant_id!, { data: tenant, timestamp: Date.now() });
        }
      } catch (error: any) {
        console.error("Error fetching tenant:", error);
        if (error.response?.status === 404) {
          localStorage.removeItem("last_tenant_id");
        }
        setCurrentTenant(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserTenant();
  }, [profile?.tenant_id, authLoading, authTenant, isSuperAdmin, isManualSelection]);

  // Apply tenant-specific theme settings
  useEffect(() => {
    if (currentTenant) {
      document.documentElement.style.setProperty(
        "--primary",
        currentTenant.settings?.theme?.colors?.primary || "221.2 83.2% 53.3%"
      );

      // Update typography if needed
      if (currentTenant.settings?.theme?.typography?.fontFamily) {
        document.documentElement.style.setProperty(
          "--font-family",
          currentTenant.settings.theme.typography.fontFamily
        );
      }
    }
  }, [currentTenant]);

  // Dynamically override translations (élève vs étudiant) based on tenant type
  useEffect(() => {
    if (currentTenant) {
      const type = (currentTenant.type || "").toUpperCase().trim();
      const isUniversity = [
        'UNIVERSITY', 'UNIVERSITÉ', 'UNIVERSITE',
        'HIGHER_EDUCATION', 'ENSEIGNEMENT_SUPERIEUR', 'ENSEIGNEMENT SUPERIEUR',
        'FACULTE', 'FACULTÉ', 'INSTITUT', 'ECOLE_SUPERIEURE', 'ÉCOLE_SUPÉRIEURE',
        'BTS', 'IUT'
      ].includes(type);

      if (isUniversity) {
        i18n.addResourceBundle('fr', 'translation', {
          navigation: { students: "Étudiants" },
          nav: { students: "Étudiants" },
          students: {
            title: "Étudiants",
            addStudent: "Ajouter un étudiant",
            editStudent: "Modifier l'étudiant",
            deleteStudent: "Supprimer l'étudiant",
            studentList: "Liste des étudiants",
            studentDetails: "Détails de l'étudiant",
            noStudents: "Aucun étudiant trouvé",
            searchPlaceholder: "Rechercher un étudiant...",
          },
          classes: {
            students: "Étudiants",
            enrollmentCount: "Nombre d'étudiants"
          },
          reports: { studentReport: "Rapport étudiant" },
          portal: { studentSpace: "Espace Étudiant" }
        }, true, true);
      } else {
        i18n.addResourceBundle('fr', 'translation', {
          navigation: { students: "Élèves" },
          nav: { students: "Élèves" },
          students: {
            title: "Élèves",
            addStudent: "Ajouter un élève",
            editStudent: "Modifier l'élève",
            deleteStudent: "Supprimer l'élève",
            studentList: "Liste des élèves",
            studentDetails: "Détails de l'élève",
            noStudents: "Aucun élève trouvé",
            searchPlaceholder: "Rechercher un élève...",
          },
          classes: {
            students: "Élèves",
            enrollmentCount: "Nombre d'élèves"
          },
          reports: { studentReport: "Rapport élève" },
          portal: { studentSpace: "Espace Élève" }
        }, true, true);
      }
    }
  }, [currentTenant]);

  const fetchTenantBySlug = useCallback(async (slug: string): Promise<Tenant | null> => {
    // Check cache first
    const cacheKey = `slug:${slug}`;
    const cached = tenantCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setCurrentTenant(cached.data);
      return cached.data;
    }

    setIsLoading(true);
    try {
      const response = await apiClient.get(`/tenants/slug/${slug}/`);
      if (response.data) {
        const tenant = response.data;
        setCurrentTenant(tenant);
        localStorage.setItem("last_tenant_id", tenant.id);
        tenantCache.set(cacheKey, { data: tenant, timestamp: Date.now() });
        tenantCache.set(tenant.id, { data: tenant, timestamp: Date.now() });
        return tenant;
      }
      return null;
    } catch (error: any) {
      console.error("Error fetching tenant by slug:", error);
      if (error.response?.status === 404) {
        localStorage.removeItem("last_tenant_id");
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchTenant = useCallback(async (tenantId: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.get(`/tenants/${tenantId}`);
      if (response.data) {
        const tenant = response.data;
        setCurrentTenant(tenant);
        setIsManualSelection(true);
        localStorage.setItem("last_tenant_id", tenantId);
      }
    } catch (error: any) {
      console.error("Error switching tenant:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Memoize context value
  const contextValue = useMemo(() => ({
    currentTenant,
    tenant: currentTenant,
    allTenants,
    setCurrentTenant,
    switchTenant,
    isLoading,
    fetchTenantBySlug,
  }), [currentTenant, allTenants, switchTenant, isLoading, fetchTenantBySlug]);

  return (
    <TenantContext.Provider value={contextValue}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
