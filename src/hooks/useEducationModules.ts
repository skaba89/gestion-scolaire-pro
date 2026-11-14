import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { CORE_EDUCATION_MODULES, moduleForPage, type EducationCatalog, type EducationConfiguration } from "@/lib/education-modules";

export function useEducationCatalog() {
  const { user } = useAuth();
  return useQuery<EducationCatalog>({
    queryKey: ["education-catalog"],
    queryFn: () => apiClient.get("/education/catalog/").then(r => r.data),
    enabled: !!user,
    staleTime: 60 * 60 * 1000,
  });
}

export function useEducationModules() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const query = useQuery<EducationConfiguration>({
    queryKey: ["education-configuration", tenant?.id, user?.id],
    queryFn: () => apiClient.get("/education/configuration/").then(r => r.data),
    enabled: !!tenant?.id && !!user,
    // Presentation cache only; every API request checks the current DB policy.
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const enabled = useMemo(() => new Set(query.data?.enabled_modules ?? CORE_EDUCATION_MODULES), [query.data]);
  const isModuleEnabled = useCallback((id: string) => enabled.has(id), [enabled]);
  const isPathEnabled = useCallback((path: string) => {
    const id = moduleForPage(path);
    return !id || enabled.has(id);
  }, [enabled]);
  return { ...query, isModuleEnabled, isPathEnabled };
}
