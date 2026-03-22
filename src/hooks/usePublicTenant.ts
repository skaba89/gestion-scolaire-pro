// src/hooks/usePublicTenant.ts
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { TenantPublicResponse, TenantPublicCard } from '@/types/tenant';

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

// Axios instance sans authentification (endpoints publics)
const publicApi = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Charge les données publiques complètes d'un établissement par son slug.
 * Utilisé par les landing pages (/ecole/:slug).
 */
export function usePublicTenant(slug: string | undefined) {
  return useQuery<TenantPublicResponse, Error>({
    queryKey: ['public-tenant', slug],
    queryFn: async () => {
      if (!slug) throw new Error('Slug requis');
      const { data } = await publicApi.get<TenantPublicResponse>(
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
export function usePublicTenants() {
  return useQuery<TenantPublicCard[], Error>({
    queryKey: ['public-tenants'],
    queryFn: async () => {
      const { data } = await publicApi.get<TenantPublicCard[]>('/tenants/public/');
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
      const { data } = await publicApi.get<TenantPublicResponse>(
        `/tenants/by-domain/${encodeURIComponent(domain)}/`
      );
      return data;
    },
    enabled: Boolean(domain) && domain !== 'localhost',
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
