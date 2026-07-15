/**
 * Persistance offline du cache React Query — Phase 6, offline read-only MVP.
 *
 * Seules les données de CONSULTATION non sensibles sont persistées
 * (localStorage), pour rester lisibles après un rechargement hors ligne :
 * emploi du temps, classes, listes d'élèves, présences du jour, devoirs.
 *
 * Règles de sécurité (issue #23) :
 * - JAMAIS de notes, paiements, factures, messages, MFA ou audit en local ;
 * - liste blanche EXACTE sur le premier segment de la queryKey, doublée
 *   d'une liste noire par motif au cas où une clé future serait ambiguë ;
 * - cache purgé au logout (auth:clear-cache) et périmé après 24 h.
 */
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Query } from "@tanstack/react-query";

export const OFFLINE_CACHE_KEY = "schoolflow:offline-cache";
export const OFFLINE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 h
// À incrémenter si la forme des données persistées change.
export const OFFLINE_CACHE_BUSTER = "offline-v1";

// Liste blanche : correspondance EXACTE sur queryKey[0].
const PERSISTED_QUERY_KEYS = new Set<string>([
  // Structure pédagogique
  "academic-years",
  "terms",
  "levels",
  "subjects",
  "departments",
  "campuses",
  "rooms",
  "classrooms",
  "admin-classrooms",
  "admin-terms",
  // Personnes (listes d'identité uniquement — pas de notes ni finances)
  "students",
  "teachers",
  "enrollments",
  "parent-children",
  // Journée de classe
  "schedule",
  "teacher-schedule",
  "teacher-schedule-data",
  "teacher-assignments",
  "teacher-terms",
  "classroom-students-attendance",
  "attendance-records",
  "homework",
  "school-events",
  "parent-upcoming-events",
  // Contenu public du tenant
  "public-tenant",
  "public-pages",
  "public-nav",
]);

// Liste noire de sécurité : si une clé autorisée évoluait vers un de ces
// motifs, elle serait exclue malgré la liste blanche.
const SENSITIVE_KEY_PATTERN =
  /(grade|invoice|payment|billing|finance|cash-flow|salar|message|conversation|mfa|audit|password|token|risk)/i;

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0];
  if (typeof first !== "string") return false;
  if (SENSITIVE_KEY_PATTERN.test(first)) return false;
  return PERSISTED_QUERY_KEYS.has(first);
}

export function shouldDehydrateQuery(query: Query): boolean {
  return query.state.status === "success" && shouldPersistQuery(query.queryKey);
}

export const offlinePersister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: OFFLINE_CACHE_KEY,
  throttleTime: 2000,
});

/** Purge le cache persisté (logout / changement de tenant). */
export function clearOfflineCache(): void {
  try {
    window.localStorage.removeItem(OFFLINE_CACHE_KEY);
  } catch {
    // localStorage indisponible (navigation privée stricte) — rien à purger.
  }
}
