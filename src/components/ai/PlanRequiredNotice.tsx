import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantUrl } from "@/hooks/useTenantUrl";

/**
 * Contenu d'une bulle d'assistant IA quand l'API répond 402 (abonnement requis).
 * Le lien vers la facturation n'est proposé qu'au TENANT_ADMIN, seul autorisé
 * à souscrire (billing.py).
 */
export function PlanRequiredNotice() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const { getTenantUrl } = useTenantUrl();

  return (
    <>
      {t("planRequired.aiAssistant")}
      {hasRole("TENANT_ADMIN") && (
        <>
          {"\n"}
          <Link to={getTenantUrl("/admin/billing")} className="font-medium underline underline-offset-2">
            {t("planRequired.viewPlans")}
          </Link>
        </>
      )}
    </>
  );
}
