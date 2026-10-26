/**
 * usePlan — hook React Query pour connaître le plan d'abonnement du tenant courant.
 *
 * Usage:
 *   const { plan, status, hasAccess, isActive, trialActive, trialEndsAt } = usePlan();
 *
 * hasAccess vérifie aussi que le statut est actif ou en essai non échu.
 * Grille du 2026-10-26 (src/lib/pricing.ts) : pas d'offre gratuite.
 * Affichage uniquement — le backend (require_plan) décide.
 */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { hasPlanAccess, type PlanSlug } from "@/lib/pricing";

interface SubscriptionInfo {
  plan: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | string;
  trial_active: boolean;
  trial_ends_at: string | null;
  billing_email: string | null;
  is_super_admin?: boolean;
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function usePlan() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<SubscriptionInfo>({
    queryKey: ["billing-subscription"],
    queryFn: () => apiClient.get("/billing/subscription/").then((r) => r.data),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,   // 5 min cache
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  const plan = data?.plan ?? "standard";
  const status = data?.status ?? "trialing";
  const isSuperAdmin = data?.is_super_admin ?? false;

  // Essai sans date de fin ou échu : refusé, comme require_plan côté backend.
  const trialExpired =
    status === "trialing" && (!data?.trial_ends_at || new Date(data.trial_ends_at).getTime() <= Date.now());

  const hasAccess = (minPlan: PlanSlug): boolean => {
    if (isSuperAdmin) return true; // Super-admin always has full access
    if (!ACTIVE_STATUSES.has(status) || (data && trialExpired)) return false;
    return hasPlanAccess(plan, minPlan);
  };

  return {
    // Raw data
    plan,
    status,
    trialActive: data?.trial_active ?? false,
    trialEndsAt: data?.trial_ends_at ? new Date(data.trial_ends_at) : null,
    billingEmail: data?.billing_email ?? null,
    isSuperAdmin,

    // Loading state
    isLoading,
    error,

    // Convenience flags
    isActive: ACTIVE_STATUSES.has(status) || isSuperAdmin,
    isEnterprise: hasAccess("enterprise"),

    // Generic check
    hasAccess,

    // Days remaining in trial
    trialDaysLeft: (() => {
      if (!data?.trial_ends_at) return null;
      const ms = new Date(data.trial_ends_at).getTime() - Date.now();
      return Math.max(0, Math.ceil(ms / 86_400_000));
    })(),
  };
}
