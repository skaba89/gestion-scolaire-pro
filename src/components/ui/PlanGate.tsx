/**
 * PlanGate — composant de gating UI basé sur le plan d'abonnement.
 *
 * Usage:
 *   <PlanGate minPlan="standard">
 *     <AIInsightsPanel />
 *   </PlanGate>
 *
 *   <PlanGate minPlan="standard" fallback={<div>Abonnement requis</div>}>
 *     <ImportButton />
 *   </PlanGate>
 */
import { Link } from "react-router-dom";
import { Lock, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/usePlan";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { PLAN_LABELS, type PlanSlug as Plan } from "@/lib/pricing";

interface PlanGateProps {
  /** Minimum plan required to see the content */
  minPlan: Plan;
  /** Custom fallback instead of the default upgrade banner */
  fallback?: React.ReactNode;
  /** Children shown when plan is sufficient */
  children: React.ReactNode;
  /** Show a compact inline badge instead of a full banner */
  compact?: boolean;
}

function UpgradeBanner({ minPlan, compact }: { minPlan: Plan; compact?: boolean }) {
  const { getTenantUrl } = useTenantUrl();

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
        <Lock className="w-3 h-3" />
        {minPlan === "standard" ? "Abonnement requis" : `Offre ${PLAN_LABELS[minPlan]} requise`}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
        <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div>
        <p className="font-semibold text-gray-900 dark:text-white mb-1">
          {minPlan === "standard" ? (
            "Fonctionnalité incluse dans l'abonnement"
          ) : (
            <>Fonctionnalité réservée à l'offre <span className="text-indigo-600 dark:text-indigo-400">{PLAN_LABELS[minPlan]}</span></>
          )}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Votre essai est terminé ou votre abonnement n'est pas actif. Souscrivez une offre pour y accéder.
        </p>
      </div>
      <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
        <Link to={getTenantUrl("/admin/billing")}>
          <Zap className="w-4 h-4 mr-2" />
          Voir les offres
          <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </Button>
    </div>
  );
}

export function PlanGate({ minPlan, fallback, children, compact = false }: PlanGateProps) {
  const { hasAccess, isLoading } = usePlan();

  // While loading, render children optimistically to avoid flash of upgrade banner
  if (isLoading) {
    return <>{children}</>;
  }

  if (hasAccess(minPlan)) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return <UpgradeBanner minPlan={minPlan} compact={compact} />;
}
