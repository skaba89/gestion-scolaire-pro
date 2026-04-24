/**
 * useOfflineSync — Synchronise les données hors-ligne quand la connexion revient.
 *
 * Gère deux files d'attente :
 *   1. pendingAttendance → POST /attendance/
 *   2. pendingGrades     → POST /grades/
 *
 * Comportement :
 *   - Détecte online/offline via window events
 *   - Au retour en ligne → sync automatique avec délai de 2s (réseau stabilisé)
 *   - Max 3 tentatives par item avant marquage comme erreur
 *   - Expose : isOnline, pendingCount, isSyncing, syncNow, lastSyncAt
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { offlineDb, getPendingCounts, type PendingAttendance, type PendingGrade } from "@/lib/offlineDb";
import { apiClient } from "@/api/client";

const MAX_RETRIES = 3;
const SYNC_DELAY_MS = 2000; // wait 2s after coming online for network to stabilize

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  lastSyncResult: { synced: number; failed: number } | null;
}

export function useOfflineSync() {
  const [state, setState] = useState<SyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    lastSyncResult: null,
  });

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  // ── Update pending count ─────────────────────────────────────────────────

  const refreshPendingCount = useCallback(async () => {
    try {
      const counts = await getPendingCounts();
      setState((prev) => ({ ...prev, pendingCount: counts.total }));
    } catch {
      // IndexedDB might not be available in all environments
    }
  }, []);

  // ── Sync one attendance record ───────────────────────────────────────────

  const syncAttendance = async (item: PendingAttendance): Promise<boolean> => {
    try {
      await apiClient.post("/attendance/", {
        student_id: item.studentId,
        classroom_id: item.classroomId,
        subject_id: item.subjectId,
        date: item.date,
        status: item.status,
        reason: item.reason,
        // Idempotency key so server can deduplicate
        idempotency_key: item.localId,
      });

      // Mark as synced
      await offlineDb.pendingAttendance.update(item.id!, {
        synced: 1,
        syncedAt: Date.now(),
        syncError: undefined,
      });
      return true;
    } catch (error: any) {
      const retries = (item.retries || 0) + 1;
      const isConflict = error?.response?.status === 409; // Already exists — consider synced

      await offlineDb.pendingAttendance.update(item.id!, {
        synced: isConflict ? 1 : 0,
        syncedAt: isConflict ? Date.now() : undefined,
        retries,
        syncError: isConflict ? undefined : String(error?.response?.data?.detail || error?.message || "Unknown error"),
      });
      return isConflict;
    }
  };

  // ── Sync one grade record ─────────────────────────────────────────────────

  const syncGrade = async (item: PendingGrade): Promise<boolean> => {
    try {
      await apiClient.post("/grades/", {
        student_id: item.studentId,
        subject_id: item.subjectId,
        assessment_id: item.assessmentId,
        score: item.score,
        max_score: item.maxScore,
        coefficient: item.coefficient,
        comments: item.comments,
        idempotency_key: item.localId,
      });

      await offlineDb.pendingGrades.update(item.id!, {
        synced: 1,
        syncedAt: Date.now(),
        syncError: undefined,
      });
      return true;
    } catch (error: any) {
      const retries = (item.retries || 0) + 1;
      const isConflict = error?.response?.status === 409;

      await offlineDb.pendingGrades.update(item.id!, {
        synced: isConflict ? 1 : 0,
        syncedAt: isConflict ? Date.now() : undefined,
        retries,
        syncError: isConflict ? undefined : String(error?.response?.data?.detail || error?.message || "Unknown error"),
      });
      return isConflict;
    }
  };

  // ── Main sync function ────────────────────────────────────────────────────

  const syncNow = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    if (isSyncingRef.current || !navigator.onLine) {
      return { synced: 0, failed: 0 };
    }

    isSyncingRef.current = true;
    setState((prev) => ({ ...prev, isSyncing: true }));

    let synced = 0;
    let failed = 0;

    try {
      // ── Sync attendance ───────────────────────────────────────────────────
      const pendingAttendance = await offlineDb.pendingAttendance
        .where("synced")
        .equals(0)
        .and((item) => item.retries < MAX_RETRIES)
        .toArray();

      for (const item of pendingAttendance) {
        const ok = await syncAttendance(item);
        ok ? synced++ : failed++;
      }

      // ── Sync grades ───────────────────────────────────────────────────────
      const pendingGrades = await offlineDb.pendingGrades
        .where("synced")
        .equals(0)
        .and((item) => item.retries < MAX_RETRIES)
        .toArray();

      for (const item of pendingGrades) {
        const ok = await syncGrade(item);
        ok ? synced++ : failed++;
      }

      // ── Clean up old synced records (keep last 7 days) ────────────────────
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      await offlineDb.pendingAttendance
        .where("synced").equals(1)
        .and((item) => (item.syncedAt || 0) < cutoff)
        .delete();
      await offlineDb.pendingGrades
        .where("synced").equals(1)
        .and((item) => (item.syncedAt || 0) < cutoff)
        .delete();

    } catch (err) {
      console.error("[OfflineSync] Sync error:", err);
    } finally {
      isSyncingRef.current = false;
      const counts = await getPendingCounts();
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        pendingCount: counts.total,
        lastSyncAt: new Date(),
        lastSyncResult: { synced, failed },
      }));
    }

    return { synced, failed };
  }, []);

  // ── Online/offline detection ──────────────────────────────────────────────

  useEffect(() => {
    const handleOnline = () => {
      setState((prev) => ({ ...prev, isOnline: true }));

      // Wait a moment for network to stabilize before syncing
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        syncNow();
      }, SYNC_DELAY_MS);
    };

    const handleOffline = () => {
      setState((prev) => ({ ...prev, isOnline: false }));
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Load initial pending count
    refreshPendingCount();

    // Initial sync if online
    if (navigator.onLine) {
      syncNow();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [syncNow, refreshPendingCount]);

  // ── Periodic count refresh (every 30s) ───────────────────────────────────

  useEffect(() => {
    const interval = setInterval(refreshPendingCount, 30_000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  return {
    ...state,
    syncNow,
    refreshPendingCount,
  };
}
