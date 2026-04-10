import { useState, useEffect } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePWA } from "@/hooks/usePWA";

const OfflineIndicator = () => {
  const { isOnline, isSyncing, pendingCount, syncData } = usePWA();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
    } else if (pendingCount === 0) {
      // Small delay to let user see "Connecté" if it just came back
      const timer = setTimeout(() => setShowBanner(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, pendingCount]);

  const handleManualSync = () => {
    syncData();
  };

  if (!showBanner && isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-20 left-4 right-4 md:bottom-4 md:left-auto md:right-4 md:max-w-sm z-50 transition-all duration-300",
        showBanner || !isOnline || pendingCount > 0
          ? "translate-y-0 opacity-100"
          : "translate-y-full opacity-0"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg backdrop-blur-md",
          isOnline ? "bg-green-500/90 text-white" : "bg-amber-500/90 text-white"
        )}
      >
        {isOnline ? (
          <>
            <Wifi className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Connecté</p>
              {pendingCount > 0 && (
                <p className="text-xs opacity-90">
                  {pendingCount} élément(s) en attente
                </p>
              )}
            </div>
            {pendingCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="text-white hover:bg-white/20"
              >
                <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
              </Button>
            )}
          </>
        ) : (
          <>
            <WifiOff className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Mode hors-ligne</p>
              <p className="text-xs opacity-90">
                Les données seront synchronisées à la reconnexion
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;
