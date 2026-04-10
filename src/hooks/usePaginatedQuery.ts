import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiClient } from "@/api/client";

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface UsePaginatedQueryOptions<T> {
  queryKey: (string | number | boolean | null | undefined)[];
  endpoint: string;
  filters?: Record<string, any>;
  pageSize?: number;
  page?: number;
}

/**
 * Hook for paginated queries via the sovereign API.
 * Replaces the previous Supabase-based implementation.
 *
 * @example
 * const { data, isLoading } = usePaginatedQuery({
 *   queryKey: ['students'],
 *   endpoint: '/students/',
 *   page: 1,
 *   pageSize: 25,
 *   filters: { status: 'active' },
 * });
 */
export function usePaginatedQuery<T>({
  queryKey,
  endpoint,
  filters = {},
  pageSize = 25,
  page = 1,
}: UsePaginatedQueryOptions<T>) {
  return useQuery<PaginatedResponse<T>>({
    queryKey: [...queryKey, page, pageSize],
    queryFn: async () => {
      try {
        const { data, status } = await apiClient.get(endpoint, {
          params: {
            ...filters,
            page,
            page_size: pageSize,
          },
        });

        // Support both paginated response shapes:
        // 1. DRF PaginatedResponse: { results: [...], count: number }
        // 2. Custom shape: { data: [...], totalCount: number }
        const results = data?.results ?? data?.data ?? data?.items ?? [];
        const totalCount = data?.count ?? data?.totalCount ?? data?.total ?? 0;
        const totalPages = Math.ceil(totalCount / pageSize);

        return {
          data: (Array.isArray(results) ? results : []) as T[],
          totalCount: totalCount as number,
          page,
          pageSize,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        };
      } catch (error) {
        console.error(`usePaginatedQuery error on ${endpoint}:`, error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (garbage collection time)
    retry: 2,
    retryDelay: (attemptIndex) =>
      Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook for infinite scroll queries (loads more pages as user scrolls)
 * Better UX than traditional pagination for mobile
 */
export function useInfiniteScrollQuery<T>({
  queryKey,
  endpoint,
  filters = {},
  pageSize = 25,
}: Omit<UsePaginatedQueryOptions<T>, "page">) {
  const [allData, setAllData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const { data, isLoading, hasNextPage } = usePaginatedQuery<T>({
    queryKey,
    endpoint,
    filters,
    pageSize,
    page,
  });

  useEffect(() => {
    if (data?.data) {
      if (page === 1) {
        setAllData(data.data);
      } else {
        setAllData((prev) => [...prev, ...data.data]);
      }
    }
  }, [data, page]);

  return {
    data: allData,
    isLoading,
    hasNextPage: data?.hasNextPage ?? false,
    loadMore: () => setPage((prev) => prev + 1),
  };
}

// Type export for convenience
export type { PaginatedResponse };
