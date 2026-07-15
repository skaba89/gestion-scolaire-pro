import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CreditCard, CheckCircle, AlertTriangle, Clock, XCircle,
  ArrowUpCircle, Shield, Star, Smartphone, Landmark, Hourglass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionRequest {
  id: string;
  plan_slug: string | null;
  status: string;
  billing_cycle: string;
  payment_provider: string;
  provider_reference: string | null;
  current_period_end: string | null;
  created_at: string | null;
}

interface SubscriptionInfo {
  plan: string;
  status: string;
  trial_active: boolean;
  trial_ends_at: string | null;
  billing_email: string | null;
  is_super_admin?: boolean;
  payment_methods?: string[];
  latest_request?: SubscriptionRequest | null;
}

interface BillingPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: string;
  price_monthly: number;
  price_yearly: number;
  max_students: number | null;
  max_campuses: number | null;
  features: Record<string, unknown>;
}

interface SubscribeResponse {
  request: SubscriptionRequest;
  amount_due: number;
  currency: string;
  payment_instructions: { method: string; detail: string; note: string };
  message: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "orange_money", label: "Orange Money", icon: <Smartphone className="w-4 h-4" /> },
  { id: "mtn_momo", label: "MTN MoMo", icon: <Smartphone className="w-4 h-4" /> },
  { id: "bank_transfer", label: "Virement bancaire", icon: <Landmark className="w-4 h-4" /> },
];

function formatPrice(amount: number, currency: string) {
  if (!amount) return "Gratuit";
  return `${new Intl.NumberFormat("fr-FR").format(amount)} ${currency}`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    active:          { label: "Actif",                 className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   icon: <CheckCircle className="w-3 h-3" /> },
    trialing:        { label: "Essai gratuit",         className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",      icon: <Clock className="w-3 h-3" /> },
    pending_payment: { label: "Paiement en attente",   className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",  icon: <Hourglass className="w-3 h-3" /> },
    past_due:        { label: "Paiement en retard",    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: <AlertTriangle className="w-3 h-3" /> },
    canceled:        { label: "Annulé",                className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",          icon: <XCircle className="w-3 h-3" /> },
    rejected:        { label: "Demande rejetée",       className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",          icon: <XCircle className="w-3 h-3" /> },
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
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("orange_money");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [instructions, setInstructions] = useState<SubscribeResponse | null>(null);

  const { data: sub, isLoading, refetch } = useQuery<SubscriptionInfo>({
    queryKey: ["billing-subscription"],
    queryFn: () => apiClient.get("/billing/subscription/").then((r) => r.data),
  });

  const { data: plansData } = useQuery<{ items: BillingPlan[] }>({
    queryKey: ["billing-plans"],
    queryFn: () => apiClient.get("/billing/plans/").then((r) => r.data),
  });

  const subscribe = useMutation({
    mutationFn: (payload: { plan_slug: string; billing_cycle: string; payment_method: string }) =>
      apiClient.post("/billing/subscribe/", payload).then((r) => r.data as SubscribeResponse),
    onSuccess: (data) => {
      setInstructions(data);
      setSelectedPlan(null);
      toast({ title: "Demande enregistrée", description: data.message });
      refetch();
    },
    onError: (err: any) => {
      toast({
        title: "Erreur",
        description: err?.response?.data?.detail ?? "Impossible d'enregistrer la demande d'abonnement.",
        variant: "destructive",
      });
    },
  });

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

  const plans = plansData?.items ?? [];
  const currentPlan = sub?.plan ?? "starter";
  const currentStatus = sub?.status ?? "trialing";
  const isActive = ["active", "trialing"].includes(currentStatus);
  const pendingRequest = sub?.latest_request?.status === "pending_payment" ? sub.latest_request : null;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-indigo-600" />
          Facturation & Abonnement
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Réglez votre abonnement par Mobile Money ou virement bancaire — activation après vérification du paiement.
        </p>
      </div>

      {/* Pending request banner */}
      {pendingRequest && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <Hourglass className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Demande d'abonnement en attente de validation
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Votre demande ({pendingRequest.plan_slug ?? "plan"} — {pendingRequest.billing_cycle === "yearly" ? "annuel" : "mensuel"},
              via {PAYMENT_METHODS.find((m) => m.id === pendingRequest.payment_provider)?.label ?? pendingRequest.payment_provider})
              sera activée dès que le paiement aura été vérifié par l'équipe SchoolFlow Pro.
            </p>
          </div>
        </div>
      )}

      {/* Payment instructions after subscribing */}
      {instructions && (
        <Card className="border-2 border-indigo-300 dark:border-indigo-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-500" />
              Instructions de paiement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Montant à régler :{" "}
              <strong>{formatPrice(instructions.amount_due, instructions.currency)}</strong>
            </p>
            <p className="text-gray-700 dark:text-gray-300">{instructions.payment_instructions.detail}</p>
            <p className="text-xs text-gray-500">{instructions.payment_instructions.note}</p>
          </CardContent>
        </Card>
      )}

      {/* Current plan summary */}
      <Card className={`border-2 ${isActive ? "border-indigo-200 dark:border-indigo-800" : "border-orange-200 dark:border-orange-800"}`}>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg capitalize flex items-center gap-2">
                Plan {plans.find((p) => p.slug === currentPlan)?.name ?? currentPlan}
                {currentPlan === "pro" && <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />}
              </CardTitle>
              <CardDescription className="mt-1">
                {sub?.billing_email && <>Facturé à <strong>{sub.billing_email}</strong></>}
              </CardDescription>
            </div>
            <StatusBadge status={pendingRequest ? "pending_payment" : currentStatus} />
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

          {currentStatus === "active" && !pendingRequest && (
            <div className="flex flex-wrap gap-3">
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
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Plan upgrade cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <ArrowUpCircle className="w-5 h-5 text-indigo-500" />
          Changer de plan
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => {
            const isCurrent = plan.slug === currentPlan;
            const isSelected = selectedPlan === plan.slug;
            const price = billingCycle === "yearly" ? plan.price_yearly : plan.price_monthly;

            return (
              <Card
                key={plan.slug}
                className={`relative flex flex-col transition-shadow ${
                  plan.slug === "pro"
                    ? "border-indigo-300 dark:border-indigo-700 shadow-lg"
                    : "border-gray-200 dark:border-gray-800"
                } ${isCurrent ? "ring-2 ring-indigo-400 dark:ring-indigo-600" : ""}`}
              >
                {plan.slug === "pro" && (
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
                  <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    {formatPrice(price, plan.currency)}
                    {price > 0 && <span className="text-xs text-gray-400"> / {billingCycle === "yearly" ? "an" : "mois"}</span>}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 flex-1">
                  <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 flex-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      {plan.max_students ? `${new Intl.NumberFormat("fr-FR").format(plan.max_students)} élèves max` : "Élèves illimités"}
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      {plan.max_campuses ? `${plan.max_campuses} campus` : "Campus illimités"}
                    </li>
                    {plan.description && (
                      <li className="text-xs text-gray-400">{plan.description}</li>
                    )}
                  </ul>

                  {isCurrent ? (
                    <Button variant="outline" size="sm" disabled className="w-full">
                      Plan actuel
                    </Button>
                  ) : price === 0 ? (
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <a href="mailto:sales@schoolflow.pro">Nous contacter</a>
                    </Button>
                  ) : isSelected ? (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {(["monthly", "yearly"] as const).map((cycle) => (
                          <Button
                            key={cycle}
                            variant={billingCycle === cycle ? "default" : "outline"}
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={() => setBillingCycle(cycle)}
                          >
                            {cycle === "monthly" ? "Mensuel" : "Annuel"}
                          </Button>
                        ))}
                      </div>
                      <div className="space-y-1">
                        {PAYMENT_METHODS.map((m) => (
                          <Button
                            key={m.id}
                            variant={paymentMethod === m.id ? "default" : "outline"}
                            size="sm"
                            className="w-full justify-start gap-2 text-xs"
                            onClick={() => setPaymentMethod(m.id)}
                          >
                            {m.icon}
                            {m.label}
                          </Button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                        disabled={subscribe.isPending}
                        onClick={() =>
                          subscribe.mutate({
                            plan_slug: plan.slug,
                            billing_cycle: billingCycle,
                            payment_method: paymentMethod,
                          })
                        }
                      >
                        {subscribe.isPending ? "Envoi…" : "Confirmer la demande"}
                      </Button>
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelectedPlan(null)}>
                        Retour
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                      disabled={!!pendingRequest}
                      onClick={() => setSelectedPlan(plan.slug)}
                    >
                      {pendingRequest ? "Demande en cours…" : `Passer au ${plan.name}`}
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
          Les abonnements se règlent par <strong>Orange Money, MTN MoMo ou virement bancaire</strong>.
          Chaque paiement est vérifié manuellement avant activation — conservez votre référence de transaction.
          SchoolFlow Pro ne stocke jamais vos coordonnées bancaires.
        </p>
      </div>
    </div>
  );
}
