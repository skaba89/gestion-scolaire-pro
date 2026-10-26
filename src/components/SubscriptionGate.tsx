import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, Eye, ArrowRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/hooks/usePlan";
import { useTenantUrl } from "@/hooks/useTenantUrl";

/**
 * Abonnement échu (backend : get_current_user, 402) — affichage seulement :
 * - lecture seule : bandeau au-dessus des pages, l'API refuse les écritures ;
 * - blocage : écran d'arrêt, sauf la page Facturation (l'administrateur
 *   doit pouvoir payer).
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, hasRole, signOut } = useAuth();
  const { access, readOnlyUntil, isLoading } = usePlan();
  const { getTenantUrl } = useTenantUrl();
  const { pathname } = useLocation();

  if (!user || isLoading || access === "full") return <>{children}</>;

  const billingUrl = getTenantUrl("/admin/billing");
  const canPay = hasRole("TENANT_ADMIN");
  const onBillingPage = pathname.startsWith(billingUrl);
  const until = readOnlyUntil?.toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" });

  if (access === "blocked" && !onBillingPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4 rounded-xl border p-8">
          <div className="w-12 h-12 mx-auto rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <Lock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <h1 className="text-xl font-semibold">{t("subscriptionGate.blockedTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {canPay ? t("subscriptionGate.blockedAdmin") : t("subscriptionGate.blockedMember")}
          </p>
          <div className="flex flex-col gap-2">
            {canPay && (
              <Button asChild>
                <Link to={billingUrl}>
                  {t("subscriptionGate.renew")}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => signOut()}>
              <LogOut className="w-4 h-4 mr-2" />
              {t("subscriptionGate.signOut")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-200 dark:border-orange-800 px-4 py-2 text-sm text-orange-800 dark:text-orange-200"
      >
        <Eye className="w-4 h-4" />
        <span>
          {access === "blocked"
            ? t("subscriptionGate.blockedTitle")
            : until
              ? t("subscriptionGate.readOnlyUntil", { date: until })
              : t("subscriptionGate.readOnly")}
        </span>
        {canPay && !onBillingPage && (
          <Link to={billingUrl} className="font-medium underline underline-offset-2">
            {t("subscriptionGate.renew")}
          </Link>
        )}
      </div>
      {children}
    </>
  );
}
