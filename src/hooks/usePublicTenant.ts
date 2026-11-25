// src/hooks/usePublicTenant.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { TenantPublicResponse, TenantPublicCard, TenantPublicFacets } from '@/types/tenant';

/**
 * Charge les données publiques complètes d'un établissement par son slug.
 * Utilisé par les landing pages (/ecole/:slug).
 */
export function usePublicTenant(slug: string | undefined) {
  return useQuery<TenantPublicResponse, Error>({
    queryKey: ['public-tenant', slug],
    queryFn: async () => {
      if (!slug) throw new Error('Slug requis');
      const { data } = await apiClient.get<TenantPublicResponse>(
        `/tenants/public/${encodeURIComponent(slug)}/`
      );
      return data;
    },
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}

/**
 * Charge la liste légère de tous les établissements actifs.
 * Utilisé par l'annuaire public (/annuaire).
 */
/** Annuaires : filtres facultatifs appliqués par le serveur (sans filtre : tout l'annuaire). */
export interface PublicDirectoryFilters { region?: string; prefecture?: string }

export function usePublicTenants(filters: PublicDirectoryFilters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => !!v));
  return useQuery<TenantPublicCard[], Error>({
    queryKey: ['public-tenants', params],
    queryFn: async () => {
      const { data } = await apiClient.get<TenantPublicCard[]>('/tenants/public/', { params });
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

/**
 * Charge un établissement via son domaine personnalisé.
 * Utilisé quand l'école a un domaine propre (ex: monecole.com).
 */
export function useTenantByDomain(domain: string | undefined) {
  return useQuery<TenantPublicResponse, Error>({
    queryKey: ['tenant-by-domain', domain],
    queryFn: async () => {
      if (!domain) throw new Error('Domaine requis');
      const { data } = await apiClient.get<TenantPublicResponse>(
        `/tenants/by-domain/${encodeURIComponent(domain)}/`
      );
      return data;
    },
    enabled: Boolean(domain) && domain !== 'localhost',
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/** Annuaires : régions, préfectures, villes et types présents dans l'annuaire (listes de filtres). */
export function usePublicDirectoryFacets() {
  return useQuery<TenantPublicFacets, Error>({
    queryKey: ['public-tenants-facets'],
    queryFn: async () => (await apiClient.get<TenantPublicFacets>('/tenants/public/facets/')).data,
    staleTime: 5 * 60 * 1000,
  });
}
