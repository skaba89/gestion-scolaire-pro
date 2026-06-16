/**
 * usePlan — hook React Query pour connaître le plan d'abonnement du tenant courant.
 *
 * Usage:
 *   const { plan, status, isProOrAbove, isActive, trialActive, trialEndsAt } = usePlan();
 *
 * isPro / isEnterprise vérifient aussi que le statut est actif ou en essai.
 */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";

interface SubscriptionInfo {
  plan: "starter" | "pro" | "enterprise";
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_active: boolean;
  trial_ends_at: string | null;
  billing_email: string | null;
  is_super_admin?: boolean;
}

const PLAN_WEIGHT: Record<string, number> = {
  starter: 0,
  pro: 1,
  enterprise: 2,
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function usePlan() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading, error } = useQuery<SubscriptionInfo>({
    queryKey: ["billing-subscription"],
    queryFn: () => apiClient.get("/billing/subscription/").then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,   // 5 min cache
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  const plan = data?.plan ?? "starter";
  const status = data?.status ?? "trialing";
  const isSuperAdmin = data?.is_super_admin ?? false;

  // Super-admin always has full access
  const hasAccess = (minPlan: "starter" | "pro" | "enterprise"): boolean => {
    if (isSuperAdmin) return true;
    if (!ACTIVE_STATUSES.has(status)) return false;
    return (PLAN_WEIGHT[plan] ?? 0) >= (PLAN_WEIGHT[minPlan] ?? 0);
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
    isStarter: plan === "starter",
    isProOrAbove: hasAccess("pro"),
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
