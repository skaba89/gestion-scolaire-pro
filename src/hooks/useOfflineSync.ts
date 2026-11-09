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
import { getPendingCounts } from "@/lib/offlineDb";
import { syncPendingDrafts } from "@/offline/draftSync";

const SYNC_DELAY_MS = 2000; // wait 2s after coming online for network to stabilize

/** Axios error without a `response` = the request never reached the
 * server (offline, DNS, timeout) — must never be treated the same as a
 * genuine server refusal: no retry penalty, no error message shown, just
 * try again next sync. Mirrors src/offline/outbox.ts::isNetworkError. */

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
  // Guards setState calls that resolve after unmount (e.g. a syncNow() fired
  // on mount whose promise settles once the component is already gone) —
  // without it, React logs a "no-op on unmounted component" warning and, in
  // a test environment where jsdom's window is torn down between files, the
  // pending setState can throw ReferenceError: window is not defined.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Update pending count ─────────────────────────────────────────────────

  const refreshPendingCount = useCallback(async () => {
    try {
      const counts = await getPendingCounts();
      if (!isMountedRef.current) return;
      setState((prev) => ({ ...prev, pendingCount: counts.total }));
    } catch {
      // IndexedDB might not be available in all environments
    }
  }, []);

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

    try {
      ({ synced, failed, conflicts } = await syncPendingDrafts());
    } catch (err) {
      console.error("[OfflineSync] Sync error:", err);
    } finally {
      isSyncingRef.current = false;
      const counts = await getPendingCounts();
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isSyncing: false,
          pendingCount: counts.total,
          lastSyncAt: new Date(),
          lastSyncResult: { synced, failed, conflicts },
        }));
      }
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
