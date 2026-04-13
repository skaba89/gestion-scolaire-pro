import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react";
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

// SECURITY: Clear in-memory tenant cache on logout to prevent data leakage between users
if (typeof window !== 'undefined') {
  window.addEventListener('auth:clear-cache', () => { tenantCache.clear(); });
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { profile, isLoading: authLoading, tenant: authTenant, isSuperAdmin } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualSelection, setIsManualSelection] = useState(false);

  // Stable flag to track if initial fetch has been done
  const initialFetchDone = useRef(false);

  // Fetch all tenants for Super Admin (only once)
  useEffect(() => {
    if (authLoading || initialFetchDone.current) return;
    initialFetchDone.current = true;

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

  // Track the resolved tenant ID to prevent redundant fetches
  const resolvedTenantId = useRef<string | null>(null);

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
      // Prevent redundant fetch if already resolved this tenant
      if (resolvedTenantId.current === lastTenantId && currentTenant) {
        return;
      }
      resolvedTenantId.current = lastTenantId;

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
            resolvedTenantId.current = null;
          }
        } finally {
          setIsLoading(false);
        }
      };
      fetchLastTenant();
      return;
    }

    if (authTenant && authTenant.id) {
      // Prevent redundant set if already resolved
      if (resolvedTenantId.current === authTenant.id) return;
      resolvedTenantId.current = authTenant.id;
      setCurrentTenant(authTenant);
      localStorage.setItem("last_tenant_id", authTenant.id);
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

    // Prevent redundant fetch if already resolved this tenant
    if (resolvedTenantId.current === profile.tenant_id && currentTenant) {
      setIsLoading(false);
      return;
    }
    resolvedTenantId.current = profile.tenant_id;

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
          resolvedTenantId.current = null;
        }
        setCurrentTenant(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id, authLoading, isManualSelection]);

  // Note: Tenant-specific theme/CSS variables are handled exclusively by
  // DynamicThemeProvider via useSettings() — do NOT set --primary here
  // to avoid race conditions with that provider.

  // Dynamically override translations (élève vs étudiant / pupil vs student) based on tenant type
  // Applies overrides for ALL supported languages, not just French.
  useEffect(() => {
    if (!currentTenant) return;

    const type = (currentTenant.type || "").toUpperCase().trim();
    const isUniversity = [
      'UNIVERSITY', 'UNIVERSITÉ', 'UNIVERSITE',
      'HIGHER_EDUCATION', 'ENSEIGNEMENT_SUPERIEUR', 'ENSEIGNEMENT SUPERIEUR',
      'FACULTE', 'FACULTÉ', 'INSTITUT', 'ECOLE_SUPERIEURE', 'ÉCOLE_SUPÉRIEURE',
      'BTS', 'IUT'
    ].includes(type);

    const overrides: Record<string, Record<string, unknown>> = {
      // French: Élève (school) / Étudiant (university)
      fr: isUniversity ? {
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
      } : {
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
      },

      // English: Pupils (school) / Students (university)
      en: isUniversity ? {
        navigation: { students: "Students" },
        nav: { students: "Students" },
        students: {
          title: "Students",
          addStudent: "Add Student",
          editStudent: "Edit Student",
          deleteStudent: "Delete Student",
          studentList: "Student List",
          studentDetails: "Student Details",
          noStudents: "No students found",
          searchPlaceholder: "Search for a student...",
        },
        classes: {
          students: "Students",
          enrollmentCount: "Student Count"
        },
        reports: { studentReport: "Student Report" },
        portal: { studentSpace: "Student Portal" }
      } : {
        navigation: { students: "Pupils" },
        nav: { students: "Pupils" },
        students: {
          title: "Pupils",
          addStudent: "Add Pupil",
          editStudent: "Edit Pupil",
          deleteStudent: "Delete Pupil",
          studentList: "Pupil List",
          studentDetails: "Pupil Details",
          noStudents: "No pupils found",
          searchPlaceholder: "Search for a pupil...",
        },
        classes: {
          students: "Pupils",
          enrollmentCount: "Pupil Count"
        },
        reports: { studentReport: "Pupil Report" },
        portal: { studentSpace: "Pupil Portal" }
      },

      // Spanish: Alumnos (school) / Estudiantes (university)
      es: isUniversity ? {
        navigation: { students: "Estudiantes" },
        nav: { students: "Estudiantes" },
        students: {
          title: "Estudiantes",
          addStudent: "Agregar estudiante",
          editStudent: "Editar estudiante",
          deleteStudent: "Eliminar estudiante",
          studentList: "Lista de estudiantes",
          studentDetails: "Detalles del estudiante",
          noStudents: "Ningún estudiante encontrado",
          searchPlaceholder: "Buscar un estudiante...",
        },
        classes: {
          students: "Estudiantes",
          enrollmentCount: "Número de estudiantes"
        },
        reports: { studentReport: "Informe estudiantil" },
        portal: { studentSpace: "Espacio Estudiante" }
      } : {
        navigation: { students: "Alumnos" },
        nav: { students: "Alumnos" },
        students: {
          title: "Alumnos",
          addStudent: "Agregar alumno",
          editStudent: "Editar alumno",
          deleteStudent: "Eliminar alumno",
          studentList: "Lista de alumnos",
          studentDetails: "Detalles del alumno",
          noStudents: "Ningún alumno encontrado",
          searchPlaceholder: "Buscar un alumno...",
        },
        classes: {
          students: "Alumnos",
          enrollmentCount: "Número de alumnos"
        },
        reports: { studentReport: "Informe de alumno" },
        portal: { studentSpace: "Espacio Alumno" }
      },

      // Arabic: التلاميذ (school pupils) / الطلاب (university students)
      ar: isUniversity ? {
        navigation: { students: "الطلاب" },
        nav: { students: "الطلاب" },
        students: {
          title: "الطلاب",
          addStudent: "إضافة طالب",
          editStudent: "تعديل الطالب",
          deleteStudent: "حذف الطالب",
          studentList: "قائمة الطلاب",
          studentDetails: "تفاصيل الطالب",
          noStudents: "لم يتم العثور على طالب",
          searchPlaceholder: "البحث عن طالب...",
        },
        classes: {
          students: "الطلاب",
          enrollmentCount: "عدد الطلاب"
        },
        reports: { studentReport: "تقرير الطالب" },
        portal: { studentSpace: "مساحة الطالب" }
      } : {
        navigation: { students: "التلاميذ" },
        nav: { students: "التلاميذ" },
        students: {
          title: "التلاميذ",
          addStudent: "إضافة تلميذ",
          editStudent: "تعديل التلميذ",
          deleteStudent: "حذف التلميذ",
          studentList: "قائمة التلاميذ",
          studentDetails: "تفاصيل التلميذ",
          noStudents: "لم يتم العثور على تلميذ",
          searchPlaceholder: "البحث عن تلميذ...",
        },
        classes: {
          students: "التلاميذ",
          enrollmentCount: "عدد التلاميذ"
        },
        reports: { studentReport: "تقرير التلميذ" },
        portal: { studentSpace: "مساحة التلميذ" }
      },

      // Chinese: 学生 (school students) / 大学生 (university students)
      zh: isUniversity ? {
        navigation: { students: "大学生" },
        nav: { students: "大学生" },
        students: {
          title: "大学生",
          addStudent: "添加大学生",
          editStudent: "编辑大学生",
          deleteStudent: "删除大学生",
          studentList: "大学生列表",
          studentDetails: "大学生详情",
          noStudents: "未找到大学生",
          searchPlaceholder: "搜索大学生...",
        },
        classes: {
          students: "大学生",
          enrollmentCount: "大学生人数"
        },
        reports: { studentReport: "大学生报告" },
        portal: { studentSpace: "大学生空间" }
      } : {
        navigation: { students: "学生" },
        nav: { students: "学生" },
        students: {
          title: "学生",
          addStudent: "添加学生",
          editStudent: "编辑学生",
          deleteStudent: "删除学生",
          studentList: "学生列表",
          studentDetails: "学生详情",
          noStudents: "未找到学生",
          searchPlaceholder: "搜索学生...",
        },
        classes: {
          students: "学生",
          enrollmentCount: "学生人数"
        },
        reports: { studentReport: "学生报告" },
        portal: { studentSpace: "学生空间" }
      }
    };

    // Apply overrides for ALL supported languages so that language switching
    // (via SettingsProvider) immediately uses the correct terminology.
    for (const [lang, bundle] of Object.entries(overrides)) {
      i18n.addResourceBundle(lang, 'translation', bundle, true, true);
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
