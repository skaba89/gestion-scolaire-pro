import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AnalyticsUnavailableProps {
  /** Relance la requête (``refetch`` de React Query). */
  onRetry?: () => void;
  className?: string;
}

/**
 * ANALYTICS-ZERO-01 : affiché quand un indicateur n'a pas pu être calculé (réponse 503 du
 * serveur, réseau…). Remplace l'ancien comportement qui affichait des zéros, impossibles à
 * distinguer d'un établissement réellement sans élève, sans absence ou sans recette.
 */
export function AnalyticsUnavailable({ onRetry, className }: AnalyticsUnavailableProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden="true" />
      <div>
        <p className="font-medium">{t("dashboard.analyticsUnavailable.title")}</p>
        <p className="text-sm text-muted-foreground">{t("dashboard.analyticsUnavailable.description")}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
          {t("dashboard.analyticsUnavailable.retry")}
        </Button>
      )}
    </div>
  );
}
