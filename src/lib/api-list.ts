/**
 * Normalise une réponse de liste de l'API — tableau brut ou objet paginé
 * `{ items: [...] }` — en tableau typé. Remplace le motif répété
 * `Array.isArray(data) ? data : (data?.items ?? [])`, qui produisait un
 * `any` implicite dans tous les `filter` / `map` / `reduce` en aval.
 */
export function toList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const items = (data as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}
