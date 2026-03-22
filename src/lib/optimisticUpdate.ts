/**
 * Optimistic update helpers for React Query mutations.
 *
 * Reduces boilerplate when implementing optimistic UI patterns.
 *
 * @example
 *   const mutation = useMutation({
 *     mutationFn: (data) => apiClient.patch(`/students/${data.id}`, data),
 *     ...createOptimisticConfig<Student>(queryClient, queryKeys.students.list()),
 *   });
 */
import type { QueryClient } from "@tanstack/react-query";

// ── Primitive helpers ─────────────────────────────────────────────────────────

/**
 * Optimistically prepend an item to a list query.
 * Returns the previous data for rollback.
 */
export function optimisticAdd<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  newItem: T
): T[] | undefined {
  const previous = queryClient.getQueryData<T[]>(queryKey);
  queryClient.setQueryData<T[]>(queryKey, (old = []) => [newItem, ...old]);
  return previous;
}

/**
 * Optimistically update a single item inside a list query.
 * Returns the previous data for rollback.
 */
export function optimisticUpdate<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updatedItem: Partial<T> & { id: string }
): T[] | undefined {
  const previous = queryClient.getQueryData<T[]>(queryKey);
  queryClient.setQueryData<T[]>(queryKey, (old = []) =>
    old.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item))
  );
  return previous;
}

/**
 * Optimistically remove an item from a list query.
 * Returns the previous data for rollback.
 */
export function optimisticRemove<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  itemId: string
): T[] | undefined {
  const previous = queryClient.getQueryData<T[]>(queryKey);
  queryClient.setQueryData<T[]>(queryKey, (old = []) =>
    old.filter((item) => item.id !== itemId)
  );
  return previous;
}

/**
 * Restore a list query to its previous state after a failed mutation.
 */
export function rollback<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  previousData: T | undefined
): void {
  if (previousData !== undefined) {
    queryClient.setQueryData(queryKey, previousData);
  }
}

// ── Convenience factory ───────────────────────────────────────────────────────

/**
 * Build a complete `onMutate / onError / onSettled` config for list-update mutations.
 *
 * @example
 *   useMutation({
 *     mutationFn: updateStudent,
 *     ...createOptimisticConfig<Student>(queryClient, queryKeys.students.list()),
 *   })
 */
export function createOptimisticConfig<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[]
) {
  return {
    onMutate: async (variables: Partial<T> & { id: string }) => {
      // Cancel any in-flight refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey });
      const previous = optimisticUpdate(queryClient, queryKey, variables);
      return { previous };
    },
    onError: (
      _err: unknown,
      _vars: unknown,
      context?: { previous?: T[] }
    ) => {
      rollback(queryClient, queryKey, context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  };
}
