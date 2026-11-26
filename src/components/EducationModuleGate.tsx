import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEducationModules } from "@/hooks/useEducationModules";
import { adminPageForPath, moduleForPage } from "@/lib/education-modules";
import { Button } from "@/components/ui/button";

export function EducationModuleFeature({ module, children }: { module: string; children: ReactNode }) {
  const { isModuleEnabled } = useEducationModules();
  return isModuleEnabled(module) ? children : null;
}

export function EducationModuleGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const query = useEducationModules();
  const { t } = useTranslation();
  const module = moduleForPage(pathname);
  // Lot B3 : écran hors du périmètre par cycle du compte → message clair plutôt qu'une erreur 403.
  if (!query.isPathInScope(pathname)) return <div role="alert" className="rounded-lg border p-6">
    <h2 className="text-lg font-semibold">{t("educationModules.outOfScopeTitle")}</h2>
    <p>{t("educationModules.outOfScopeMessage")}</p>
    {/* RH (décision 2026-11-25, option A) : réservée aux comptes non limités, raison explicite. */}
    {adminPageForPath(pathname, query.cycleScope?.pages ?? {}) === "hr" && (
      <p className="mt-2 text-sm text-muted-foreground">{t("educationModules.outOfScopeHrReason")}</p>
    )}
  </div>;
  if (!module) return children;
  if (query.isLoading) return <p role="status">{t("educationModules.loading")}</p>;
  if (query.error) return <div role="alert" className="space-y-3 rounded-lg border p-6">
    <p>{t("educationModules.loadError")}</p>
    <Button onClick={() => void query.refetch()}>{t("educationModules.reload")}</Button>
  </div>;
  if (!query.isModuleEnabled(module)) return <div role="alert" className="rounded-lg border p-6">
    <h2 className="text-lg font-semibold">{t("educationModules.disabledTitle")}</h2>
    <p>{t("educationModules.disabledMessage")}</p>
  </div>;
  return children;
}
