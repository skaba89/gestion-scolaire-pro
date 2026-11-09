/**
 * État hors ligne unique de l'application (O6-B) : connexion, nombre RÉEL de
 * saisies non envoyées (file d'envoi + brouillons) et envoi manuel.
 *
 * Remplace usePWA, qui comptait une file (SchoolFlowDB.syncQueue) que rien
 * n'alimentait — l'indicateur affichait toujours « 0 en attente » — et dont
 * la « synchronisation » supprimait les opérations sans les envoyer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { syncPendingDrafts } from "@/offline/draftSync";
import { flushOfflineQueue } from "@/offline/outbox";
import { countUnsyncedOfflineWork, retireLegacyDatabase } from "@/offline/purge";

const REFRESH_INTERVAL_MS = 10_000;

export function useOfflineStatus() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const tenantId = tenant?.id ? String(tenant.id) : null;
  const userId = user?.id ? String(user.id) : null;

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const count = await countUnsyncedOfflineWork();
      if (mounted.current) setPendingCount(count);
    } catch (error) {
      console.warn("[offline] comptage des saisies en attente impossible", error);
    }
  }, []);

  /** Envoi réel : file d'envoi puis brouillons (clés d'idempotence). */
  const syncNow = useCallback(async () => {
    if (!navigator.onLine || !tenantId) return;
    setIsSyncing(true);
    try {
      await flushOfflineQueue(tenantId, undefined, userId);
      await syncPendingDrafts();
    } catch (error) {
      console.error("[offline] synchronisation manuelle impossible", error);
    } finally {
      if (mounted.current) setIsSyncing(false);
      await refresh();
    }
  }, [tenantId, userId, refresh]);

  useEffect(() => {
    mounted.current = true;
    const onChange = () => {
      setIsOnline(navigator.onLine);
      void refresh();
    };
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    void refresh();
    void retireLegacyDatabase().catch((error) =>
      console.warn("[offline] retrait de l'ancienne base impossible", error),
    );
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      clearInterval(timer);
    };
  }, [refresh]);

  return { isOnline, isSyncing, pendingCount, syncNow, refresh };
}
