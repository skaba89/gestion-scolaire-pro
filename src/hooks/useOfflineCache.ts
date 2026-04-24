/**
 * useOfflineCache — Pré-remplit IndexedDB avec les données de référence
 * (élèves, classes) pendant que la connexion est active.
 *
 * Appelé depuis les pages où le mode hors-ligne est nécessaire
 * (TeacherAttendance, etc.).
 *
 * Comportement :
 *   - Ne fait rien si hors-ligne
 *   - Ne re-cache que si les données ont plus de 30 minutes (TTL)
 *   - Silencieux en cas d'erreur (best-effort)
 */

import { useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { cacheStudents, cacheClassrooms, offlineDb } from "@/lib/offlineDb";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface UseOfflineCacheOptions {
  tenantId: string | undefined;
  classroomId?: string;
  enabled?: boolean;
}

export function useOfflineCache({
  tenantId,
  classroomId,
  enabled = true,
}: UseOfflineCacheOptions) {
  const lastCachedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || !tenantId || !navigator.onLine) return;

    const cacheClassroomStudents = async (cid: string) => {
      const lastCached = lastCachedRef.current[cid] || 0;
      if (Date.now() - lastCached < CACHE_TTL_MS) return; // skip if fresh

      try {
        // ── Students ───────────────────────────────────────────────────────
        const { data } = await apiClient.get(
          `/students/?class_id=${cid}&limit=300&status=ACTIVE`
        );
        const raw: any[] = data?.items ?? data ?? [];
        if (raw.length > 0) {
          await cacheStudents(
            tenantId,
            raw.map((s) => ({
              id: s.id,
              tenantId,
              firstName: s.first_name ?? "",
              lastName: s.last_name ?? "",
              registrationNumber: s.registration_number,
              classroomId: cid,
              gender: s.gender,
              status: s.status,
            }))
          );
        }

        lastCachedRef.current[cid] = Date.now();
      } catch {
        // Silently fail — offline cache is best-effort
      }
    };

    const cacheAllClassrooms = async () => {
      try {
        const { data } = await apiClient.get(`/classrooms/?limit=200`);
        const raw: any[] = data?.items ?? data ?? [];
        if (raw.length > 0) {
          await cacheClassrooms(
            tenantId,
            raw.map((c) => ({
              id: c.id,
              tenantId,
              name: c.name,
              levelName: c.level?.name,
              levelId: c.level_id,
            }))
          );
        }
      } catch {
        // Silently fail
      }
    };

    // Cache classrooms list once per session
    cacheAllClassrooms();

    // Cache students for the selected classroom
    if (classroomId) {
      cacheClassroomStudents(classroomId);
    }
  }, [tenantId, classroomId, enabled]);
}
