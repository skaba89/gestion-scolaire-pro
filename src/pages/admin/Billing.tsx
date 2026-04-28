import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CreditCard, Zap, CheckCircle, AlertTriangle, Clock, XCircle,
  ExternalLink, ArrowUpCircle, ReceiptText, Shield, Users, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionInfo {
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_active: boolean;
  trial_ends_at: string | null;
  billing_email: string | null;
  is_super_admin?: boolean;
}

// ─── Plan definitions (same as Pricing page) ─────────────────────────────────

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "Gratuit",
    features: ["150 élèves max", "1 campus", "Notes & bulletins", "Emploi du temps"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "29 $ / mois",
    features: ["500 élèves", "3 campus", "Notifications WhatsApp & Email", "IA pédagogique"],
    recommended: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "99 $ / mois",
    features: ["Élèves illimités", "Campus illimités", "SLA 99,9 %", "Support 24/7"],
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    active:    { label: "Actif",        className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   icon: <CheckCircle className="w-3 h-3" /> },
    trialing:  { label: "Essai gratuit",className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",      icon: <Clock className="w-3 h-3" /> },
    past_due:  { label: "Paiement en retard", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: <AlertTriangle className="w-3 h-3" /> },
    canceled:  { label: "Annulé",       className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",          icon: <XCircle className="w-3 h-3" /> },
    unpaid:    { label: "Impayé",       className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",          icon: <XCircle className="w-3 h-3" /> },
  };
  const cfg = configs[status] ?? { label: status, className: "bg-gray-100 text-gray-700", icon: null };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Billing() {
  const { toast } = useToast();
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  // Fetch subscription info
  const { data: sub, isLoading, refetch } = useQuery<SubscriptionInfo>({
    queryKey: ["billing-subscription"],
    queryFn: () => apiClient.get("/billing/subscription/").then((r) => r.data),
  });

  // Checkout mutation
  const checkout = useMutation({
    mutationFn: (plan: string) =>
      apiClient.post("/billing/checkout/", { plan }).then((r) => r.data),
    onSuccess: (data) => {
      window.location.href = data.checkout_url;
    },
    onError: (err: any) => {
      toast({
        title: "Erreur",
        description: err?.response?.data?.detail ?? "Impossible de créer la session de paiement.",
        variant: "destructive",
      });
      setUpgradingPlan(null);
    },
  });

  // Portal mutation
  const portal = useMutation({
    mutationFn: () =>
      apiClient.post("/billing/portal/", { return_url: window.location.href }).then((r) => r.data),
    onSuccess: (data) => {
      window.open(data.portal_url, "_blank");
    },
    onError: (err: any) => {
      toast({
        title: "Erreur",
        description: err?.response?.data?.detail ?? "Impossible d'ouvrir le portail de facturation.",
        variant: "destructive",
      });
    },
  });

  // Cancel mutation
  const cancel = useMutation({
    mutationFn: () => apiClient.post("/billing/cancel/").then((r) => r.data),
    onSuccess: () => {
      toast({ title: "Abonnement annulé", description: "Il reste actif jusqu'à la fin de la période en cours." });
      refetch();
    },
    onError: (err: any) => {
      toast({
        title: "Erreur",
        description: err?.response?.data?.detail ?? "Impossible d'annuler l'abonnement.",
        variant: "destructive",
      });
    },
  });

  const handleUpgrade = (planId: string) => {
    setUpgradingPlan(planId);
    checkout.mutate(planId);
  };

  const handleCancelConfirm = () => {
    if (!window.confirm("Confirmer l'annulation ? Votre accès restera actif jusqu'à la fin de la période en cours.")) return;
    cancel.mutate();
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-gray-500">
          <CreditCard className="w-10 h-10 mx-auto mb-3 animate-pulse text-indigo-400" />
          <p>Chargement de votre abonnement…</p>
        </div>
      </div>
    );
  }

  const currentPlan = sub?.plan ?? "starter";
  const currentStatus = sub?.status ?? "trialing";
  const hasActiveStripe = !!sub?.stripe_subscription_id;
  const isActive = ["active", "trialing"].includes(currentStatus);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-indigo-600" />
          Facturation & Abonnement
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Gérez votre plan, vos factures et vos informations de paiement.
        </p>
      </div>

      {/* Current plan summary */}
      <Card className={`border-2 ${isActive ? "border-indigo-200 dark:border-indigo-800" : "border-orange-200 dark:border-orange-800"}`}>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg capitalize flex items-center gap-2">
                Plan {PLANS.find((p) => p.id === currentPlan)?.name ?? currentPlan}
                {currentPlan === "pro" && <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />}
              </CardTitle>
              <CardDescription className="mt-1">
                {sub?.billing_email && <>Facturé à <strong>{sub.billing_email}</strong></>}
              </CardDescription>
            </div>
            <StatusBadge status={currentStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Trial warning */}
          {sub?.trial_active && sub?.trial_ends_at && (
            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Essai gratuit en cours</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  Votre essai Pro expire le{" "}
                  <strong>{new Date(sub.trial_ends_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong>.
                  Souscrivez avant la fin pour ne pas perdre accès.
                </p>
              </div>
            </div>
          )}

          {/* Past due warning */}
          {currentStatus === "past_due" && (
            <div className="flex items-start gap-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Paiement en retard</p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                  Mettez à jour votre moyen de paiement pour éviter la suspension de votre compte.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {/* Manage via Stripe portal */}
            {hasActiveStripe && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
                className="gap-2"
              >
                <ReceiptText className="w-4 h-4" />
                {portal.isPending ? "Ouverture…" : "Gérer les factures"}
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
              </Button>
            )}

            {/* Cancel */}
            {hasActiveStripe && currentStatus !== "canceled" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelConfirm}
                disabled={cancel.isPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 gap-2"
              >
                <XCircle className="w-4 h-4" />
                {cancel.isPending ? "Annulation…" : "Annuler l'abonnement"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Plan upgrade cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <ArrowUpCircle className="w-5 h-5 text-indigo-500" />
          Changer de plan
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isHigher =
              (plan.id === "pro" && currentPlan === "starter") ||
              (plan.id === "enterprise" && currentPlan !== "enterprise");

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col transition-shadow ${
                  plan.recommended
                    ? "border-indigo-300 dark:border-indigo-700 shadow-lg"
                    : "border-gray-200 dark:border-gray-800"
                } ${isCurrent ? "ring-2 ring-indigo-400 dark:ring-indigo-600" : ""}`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-indigo-600 text-white hover:bg-indigo-600 text-xs px-3">
                      Recommandé
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    {plan.name}
                    {isCurrent && (
                      <Badge variant="secondary" className="text-xs">Plan actuel</Badge>
                    )}
                  </CardTitle>
                  <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{plan.price}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 flex-1">
                  <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {plan.id === "enterprise" ? (
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <a href="mailto:sales@schoolflow.pro">Nous contacter</a>
                    </Button>
                  ) : isCurrent ? (
                    <Button variant="outline" size="sm" disabled className="w-full">
                      Plan actuel
                    </Button>
                  ) : isHigher ? (
                    <Button
                      size="sm"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={upgradingPlan === plan.id || checkout.isPending}
                    >
                      {upgradingPlan === plan.id ? "Redirection…" : `Passer au ${plan.name}`}
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled className="w-full text-gray-400">
                      Plan inférieur
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Security note */}
      <div className="flex items-start gap-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl p-4 text-sm text-gray-500 dark:text-gray-400">
        <Shield className="w-5 h-5 flex-shrink-0 text-gray-400 mt-0.5" />
        <p>
          Les paiements sont traités de manière sécurisée par <strong>Stripe</strong>.
          SchoolFlow Pro ne stocke jamais vos coordonnées bancaires.
          Vos factures sont disponibles directement sur le portail Stripe.
        </p>
      </div>
    </div>
  );
}
