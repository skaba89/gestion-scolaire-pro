// src/hooks/usePublicPages.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

// ─── Types ───────────────────────────────────────────────────────────────

export interface PublicNavItem {
  id: string;
  label: string;
  page_slug?: string | null;
  url?: string | null;
  sort_order?: number;
  is_external?: boolean;
  children?: PublicNavItem[];
}

export interface PublicPageSection {
  type: string; // hero | text | features | stats | gallery | cta | faq | contact_form | testimonials | timeline | custom_html
  title?: string;
  subtitle?: string;
  content?: string;
  items?: any[];
  settings?: Record<string, any>;
}

export interface PublicPageResponse {
  id: string;
  tenant: string;
  title: string;
  slug: string;
  meta_description?: string | null;
  meta_title?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  hero_image?: string | null;
  content: PublicPageSection[];
  is_published: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface PublicPageListItem {
  id: string;
  title: string;
  slug: string;
  meta_description?: string | null;
  primary_color?: string | null;
  hero_image?: string | null;
  is_home?: boolean;
  sort_order?: number;
}

// ─── Hooks ───────────────────────────────────────────────────────────────

/**
 * Fetches all published pages for a tenant.
 * Used by the landing page to list available pages.
 */
export function usePublicPages(tenantSlug: string | undefined) {
  return useQuery<PublicPageListItem[], Error>({
    queryKey: ['public-pages', tenantSlug],
    queryFn: async () => {
      if (!tenantSlug) throw new Error('Slug requis');
      const { data } = await apiClient.get<PublicPageListItem[]>(
        `/tenants/public/${encodeURIComponent(tenantSlug)}/pages/`
      );
      return data;
    },
    enabled: Boolean(tenantSlug),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}

/**
 * Fetches a single published page by slug.
 * Used by PublicPageView to render the page.
 */
export function usePublicPageBySlug(tenantSlug: string | undefined, pageSlug: string | undefined) {
  return useQuery<PublicPageResponse, Error>({
    queryKey: ['public-page', tenantSlug, pageSlug],
    queryFn: async () => {
      if (!tenantSlug || !pageSlug) throw new Error('Slug requis');
      const { data } = await apiClient.get<PublicPageResponse>(
        `/tenants/public/${encodeURIComponent(tenantSlug)}/pages/${encodeURIComponent(pageSlug)}/`
      );
      return data;
    },
    enabled: Boolean(tenantSlug) && Boolean(pageSlug),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}

/**
 * Fetches navigation items for a tenant.
 * Used to render the navbar menu.
 */
export function usePublicNav(tenantSlug: string | undefined) {
  return useQuery<PublicNavItem[], Error>({
    queryKey: ['public-nav', tenantSlug],
    queryFn: async () => {
      if (!tenantSlug) throw new Error('Slug requis');
      const { data } = await apiClient.get<PublicNavItem[]>(
        `/tenants/public/${encodeURIComponent(tenantSlug)}/nav/`
      );
      return data;
    },
    enabled: Boolean(tenantSlug),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}
