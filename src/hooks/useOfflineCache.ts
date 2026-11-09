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
 *   - Best-effort : une erreur est journalisée, sans bloquer la page
 */

import { useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { cacheClassrooms, replaceClassroomStudents } from "@/lib/offlineDb";

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
        // ── Élèves INSCRITS dans la classe ────────────────────────────────
        // O6-A : l'ancien appel /students/?class_id=…&limit=300 était ignoré
        // par l'API (paramètres inconnus) et mettait en cache la première page
        // des élèves de TOUT l'établissement, étiquetés comme élèves de la
        // classe. Les inscriptions de la classe embarquent l'élève et sont
        // accessibles à l'enseignant affecté.
        const { data } = await apiClient.get("/infrastructure/enrollments/", {
          params: { class_id: cid, status: "active" },
        });
        const enrollments: any[] = Array.isArray(data) ? data : [];
        const byId = new Map<string, { id: string; firstName: string; lastName: string; registrationNumber?: string }>();
        for (const e of enrollments) {
          const s = e?.student;
          if (e?.class_id === cid && s?.id && !byId.has(s.id)) {
            byId.set(s.id, {
              id: s.id,
              firstName: s.first_name ?? "",
              lastName: s.last_name ?? "",
              registrationNumber: s.registration_number ?? undefined,
            });
          }
        }
        await replaceClassroomStudents(tenantId, cid, [...byId.values()]);

        lastCachedRef.current[cid] = Date.now();
      } catch (error) {
        // Best-effort (le cache sert au mode hors ligne), mais jamais muet.
        console.warn("[offline] mise en cache de la classe impossible", error);
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
      } catch (error) {
        console.warn("[offline] mise en cache des classes impossible", error);
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
