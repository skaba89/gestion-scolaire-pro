/**
 * OfflineBanner — Bandeau de statut connexion pour SchoolFlow Pro Guinée
 *
 * Affiche :
 *   - Bandeau rouge "Hors-ligne" quand pas de connexion
 *   - Compteur de données en attente de synchronisation
 *   - Progression de la sync au retour de la connexion
 *   - Confirmation discrète après sync réussie
 */

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, lastSyncAt, lastSyncResult, syncNow } =
    useOfflineSync();

  const [showSuccess, setShowSuccess] = useState(false);

  // Show success flash after sync
  useEffect(() => {
    if (lastSyncResult && lastSyncResult.synced > 0 && !isSyncing) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 4000);
      return () => clearTimeout(t);
    }
  }, [lastSyncResult, isSyncing]);

  // ── Online + nothing pending → invisible ──────────────────────────────────
  if (isOnline && pendingCount === 0 && !isSyncing && !showSuccess) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between px-4 py-2 text-sm font-medium transition-all duration-300 shadow-md",
        !isOnline
          ? "bg-red-600 text-white"
          : isSyncing
          ? "bg-blue-600 text-white"
          : showSuccess
          ? "bg-green-600 text-white"
          : "bg-amber-500 text-white"
      )}
    >
      {/* Left: status icon + message */}
      <div className="flex items-center gap-2.5">
        {!isOnline ? (
          <>
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              <strong>Mode hors-ligne</strong> — Les données sont enregistrées localement
              {pendingCount > 0 && (
                <span className="ml-2 bg-white/20 rounded-full px-2 py-0.5 text-xs">
                  {pendingCount} en attente
                </span>
              )}
            </span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
            <span>
              Synchronisation en cours
              {pendingCount > 0 && ` — ${pendingCount} élément(s) restant(s)`}
            </span>
          </>
        ) : showSuccess && lastSyncResult ? (
          <>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              <strong>{lastSyncResult.synced} élément(s) synchronisé(s)</strong>
              {lastSyncResult.failed > 0 && (
                <span className="ml-2 text-yellow-200">
                  · {lastSyncResult.failed} échec(s)
                </span>
              )}
            </span>
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 shrink-0" />
            <span>
              <strong>{pendingCount} élément(s)</strong> en attente de synchronisation
            </span>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0">
        {isOnline && pendingCount > 0 && !isSyncing && (
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20 h-7 px-3 text-xs font-semibold"
            onClick={() => syncNow()}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Sync maintenant
          </Button>
        )}
        {!isOnline && pendingCount > 0 && (
          <span className="text-xs opacity-80 hidden sm:block">
            Sync automatique au retour de la connexion
          </span>
        )}
        {lastSyncAt && isOnline && !isSyncing && !showSuccess && pendingCount === 0 && (
          <span className="text-xs opacity-70">
            Dernière sync {lastSyncAt.toLocaleTimeString("fr-GN")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Compact status dot for navbar/header ──────────────────────────────────────

export function OfflineStatusDot() {
  const { isOnline, pendingCount, isSyncing } = useOfflineSync();

  if (isOnline && pendingCount === 0 && !isSyncing) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <Wifi className="w-3.5 h-3.5" />
        <span className="hidden md:inline">En ligne</span>
      </span>
    );
  }

  if (!isOnline) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-500 font-semibold">
        <WifiOff className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Hors-ligne</span>
        {pendingCount > 0 && (
          <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold">
            {pendingCount}
          </span>
        )}
      </span>
    );
  }

  if (isSyncing) {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-500">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden md:inline">Sync...</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs text-amber-500 font-semibold">
      <AlertTriangle className="w-3.5 h-3.5" />
      <span className="hidden md:inline">{pendingCount} en attente</span>
    </span>
  );
}
