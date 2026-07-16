/**
 * Synchronisation de la file d'actions offline (Phase 6, issue #23).
 *
 * Rejoue les brouillons (présences…) au démarrage de l'app et à chaque
 * retour du réseau. Le serveur revalide chaque action ; les refus sont
 * signalés à l'utilisateur et abandonnés.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTenant } from "@/contexts/TenantContext";
import { flushOfflineQueue, queueLength } from "@/lib/offline-queue";

export function useOfflineQueueSync(): void {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const flushing = useRef(false);
  const tenantId = tenant?.id ? String(tenant.id) : null;

  useEffect(() => {
    if (!tenantId) return;

    const flush = async () => {
      if (flushing.current || queueLength() === 0 || !navigator.onLine) return;
      flushing.current = true;
      try {
        const result = await flushOfflineQueue(tenantId);
        if (result.sent > 0) {
          queryClient.invalidateQueries({ queryKey: ["attendance-records"] });
          toast.success(
            `${result.sent} action(s) hors ligne synchronisée(s) avec le serveur.`,
          );
        }
        if (result.rejected.length > 0) {
          toast.warning(
            `${result.rejected.length} brouillon(s) hors ligne refusé(s) par le serveur et abandonné(s).`,
          );
        }
      } finally {
        flushing.current = false;
      }
    };

    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [tenantId, queryClient]);
}
