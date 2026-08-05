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

/** Axios error without a `response` = the request never reached the
 * server (offline, DNS, timeout) — must never be treated the same as a
 * genuine server refusal: no retry penalty, no error message shown, just
 * try again next sync. Mirrors src/offline/outbox.ts::isNetworkError. */
function isNetworkError(error: unknown): boolean {
  const err = error as { response?: unknown; request?: unknown } | null;
  return !!err && typeof err === "object" && "request" in (err as object) && !err.response;
}

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  lastSyncResult: { synced: number; failed: number; conflicts: number } | null;
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
  // Returns "synced" | "conflict" | "rejected" | "network" — the caller
  // decides how each outcome counts towards synced/failed/conflicts.

  type SyncOutcome = "synced" | "conflict" | "rejected" | "network";

  const syncAttendance = async (item: PendingAttendance): Promise<SyncOutcome> => {
    await offlineDb.pendingAttendance.update(item.id!, { syncStatus: "SYNCING" });
    try {
      await apiClient.post(
        "/attendance/",
        {
          student_id: item.studentId,
          classroom_id: item.classroomId,
          subject_id: item.subjectId,
          date: item.date,
          status: item.status,
          reason: item.reason,
        },
        // The backend reads the idempotency key from this header, never
        // from the request body (see app/core/idempotency.py) — a body
        // field is silently ignored by Pydantic and never deduplicates.
        { headers: { "X-Idempotency-Key": item.localId } },
      );

      await offlineDb.pendingAttendance.update(item.id!, {
        synced: 1,
        syncStatus: "SYNCED",
        syncedAt: Date.now(),
        syncError: undefined,
        conflict: false,
      });
      return "synced";
    } catch (error: any) {
      if (isNetworkError(error)) {
        // Still offline — no penalty, no message, stays PENDING, retried
        // on the next sync.
        await offlineDb.pendingAttendance.update(item.id!, { syncStatus: "PENDING" });
        return "network";
      }

      // A 409 here means app/core/idempotency.py's get_idempotent_response_or_lock()
      // saw this same X-Idempotency-Key already used with a DIFFERENT
      // body — a real conflict (e.g. someone else already marked this
      // student's attendance for this date), NEVER a success. Previously
      // this branch silently marked the draft as synced=1 and hid it.
      const isConflict = error?.response?.status === 409;
      const retries = (item.retries || 0) + 1;
      const exhausted = retries >= MAX_RETRIES;

      await offlineDb.pendingAttendance.update(item.id!, {
        synced: 0,
        syncStatus: isConflict || exhausted ? "REJECTED" : "PENDING",
        conflict: isConflict,
        retries,
        syncError: isConflict
          ? "Conflit : cette présence a déjà été enregistrée avec un contenu différent. Non synchronisée — vérifiez avant de ressaisir."
          : String(error?.response?.data?.detail || error?.message || "Erreur inconnue"),
      });
      return isConflict ? "conflict" : "rejected";
    }
  };

  // ── Sync one grade record ─────────────────────────────────────────────────

  const syncGrade = async (item: PendingGrade): Promise<SyncOutcome> => {
    await offlineDb.pendingGrades.update(item.id!, { syncStatus: "SYNCING" });
    try {
      await apiClient.post(
        "/grades/",
        {
          student_id: item.studentId,
          subject_id: item.subjectId,
          assessment_id: item.assessmentId,
          score: item.score,
          max_score: item.maxScore,
          coefficient: item.coefficient,
          comments: item.comments,
        },
        { headers: { "X-Idempotency-Key": item.localId } },
      );

      await offlineDb.pendingGrades.update(item.id!, {
        synced: 1,
        syncStatus: "SYNCED",
        syncedAt: Date.now(),
        syncError: undefined,
        conflict: false,
      });
      return "synced";
    } catch (error: any) {
      if (isNetworkError(error)) {
        await offlineDb.pendingGrades.update(item.id!, { syncStatus: "PENDING" });
        return "network";
      }

      // Same reasoning as syncAttendance() above — a 409 is a real
      // conflict, never a silent success.
      const isConflict = error?.response?.status === 409;
      const retries = (item.retries || 0) + 1;
      const exhausted = retries >= MAX_RETRIES;

      await offlineDb.pendingGrades.update(item.id!, {
        synced: 0,
        syncStatus: isConflict || exhausted ? "REJECTED" : "PENDING",
        conflict: isConflict,
        retries,
        syncError: isConflict
          ? "Conflit : cette note a déjà été enregistrée avec un contenu différent. Non synchronisée — vérifiez avant de ressaisir."
          : String(error?.response?.data?.detail || error?.message || "Erreur inconnue"),
      });
      return isConflict ? "conflict" : "rejected";
    }
  };

  // ── Main sync function ────────────────────────────────────────────────────

  const syncNow = useCallback(async (): Promise<{ synced: number; failed: number; conflicts: number }> => {
    if (isSyncingRef.current || !navigator.onLine) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    isSyncingRef.current = true;
    setState((prev) => ({ ...prev, isSyncing: true }));

    let synced = 0;
    let failed = 0;
    let conflicts = 0;

    const isRetryable = (item: { synced: 0 | 1; syncStatus?: string }) =>
      item.synced === 0 && (item.syncStatus ?? "PENDING") === "PENDING";

    try {
      // ── Sync attendance ───────────────────────────────────────────────────
      // Filters on syncStatus (not just retries < MAX) so a REJECTED item
      // (server refusal, incl. a 409 conflict) is never retried again —
      // it's a terminal state, not "still pending".
      const pendingAttendance = await offlineDb.pendingAttendance
        .where("synced")
        .equals(0)
        .and(isRetryable)
        .toArray();

      for (const item of pendingAttendance) {
        const outcome = await syncAttendance(item);
        if (outcome === "synced") synced++;
        else if (outcome === "conflict") conflicts++;
        else if (outcome === "rejected") failed++;
        // "network" outcome counts as neither — retried next sync, no penalty.
      }

      // ── Sync grades ───────────────────────────────────────────────────────
      const pendingGrades = await offlineDb.pendingGrades
        .where("synced")
        .equals(0)
        .and(isRetryable)
        .toArray();

      for (const item of pendingGrades) {
        const outcome = await syncGrade(item);
        if (outcome === "synced") synced++;
        else if (outcome === "conflict") conflicts++;
        else if (outcome === "rejected") failed++;
      }

      // ── Clean up old resolved records (keep last 7 days) ──────────────────
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      await offlineDb.pendingAttendance
        .where("synced").equals(1)
        .and((item) => (item.syncedAt || 0) < cutoff)
        .delete();
      await offlineDb.pendingGrades
        .where("synced").equals(1)
        .and((item) => (item.syncedAt || 0) < cutoff)
        .delete();
      await offlineDb.pendingAttendance
        .where("syncStatus").equals("REJECTED")
        .and((item) => (item.createdAt || 0) < cutoff)
        .delete();
      await offlineDb.pendingGrades
        .where("syncStatus").equals("REJECTED")
        .and((item) => (item.createdAt || 0) < cutoff)
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
        lastSyncResult: { synced, failed, conflicts },
      }));
    }

    return { synced, failed, conflicts };
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
