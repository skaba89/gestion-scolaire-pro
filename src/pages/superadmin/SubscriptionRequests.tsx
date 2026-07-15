import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReceiptText, CheckCircle, XCircle, Hourglass, Smartphone, Landmark,
  Building2, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import apiClient from "@/api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingRequest {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  tenant_slug: string | null;
  plan_slug: string | null;
  billing_cycle: string;
  payment_provider: string;
  provider_reference: string | null;
  created_at: string | null;
}

const METHOD_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  orange_money: { label: "Orange Money", icon: <Smartphone className="w-3.5 h-3.5" /> },
  mtn_momo: { label: "MTN MoMo", icon: <Smartphone className="w-3.5 h-3.5" /> },
  bank_transfer: { label: "Virement bancaire", icon: <Landmark className="w-3.5 h-3.5" /> },
  manual: { label: "Manuel", icon: <ReceiptText className="w-3.5 h-3.5" /> },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubscriptionRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<{ items: PendingRequest[]; total: number }>({
    queryKey: ["billing-requests"],
    queryFn: () => apiClient.get("/billing/requests/").then((r) => r.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["billing-requests"] });
    setConfirmingId(null);
    setRejectingId(null);
    setReference("");
    setRejectReason("");
  };

  const confirm = useMutation({
    mutationFn: ({ id, payment_reference }: { id: string; payment_reference: string }) =>
      apiClient
        .post(`/billing/requests/${id}/confirm/`, payment_reference ? { payment_reference } : {})
        .then((r) => r.data),
    onSuccess: (data) => {
      toast({ title: "Abonnement activé", description: data.message });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Erreur",
        description: err?.response?.data?.detail ?? "Impossible de confirmer le paiement.",
        variant: "destructive",
      });
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/billing/requests/${id}/reject/`, { reason }).then((r) => r.data),
    onSuccess: () => {
      toast({ title: "Demande rejetée", description: "L'établissement garde son plan actuel." });
      invalidate();
    },
    onError: (err: any) => {
      toast({
        title: "Erreur",
        description: err?.response?.data?.detail ?? "Impossible de rejeter la demande.",
        variant: "destructive",
      });
    },
  });

  const requests = data?.items ?? [];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ReceiptText className="w-6 h-6 text-indigo-600" />
            Demandes d'abonnement
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Vérifiez le paiement (Mobile Money, virement) puis activez ou rejetez chaque demande.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-500">
          <Hourglass className="w-8 h-8 mx-auto mb-3 animate-pulse text-indigo-400" />
          <p>Chargement des demandes…</p>
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-gray-500">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
            <p className="font-medium text-gray-700 dark:text-gray-300">Aucune demande en attente</p>
            <p className="text-sm mt-1">Toutes les demandes d'abonnement ont été traitées.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const method = METHOD_LABELS[req.payment_provider] ?? {
              label: req.payment_provider,
              icon: <ReceiptText className="w-3.5 h-3.5" />,
            };
            const isConfirming = confirmingId === req.id;
            const isRejecting = rejectingId === req.id;

            return (
              <Card key={req.id} className="border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        {req.tenant_name ?? "Établissement"}
                        {req.tenant_slug && (
                          <span className="text-xs font-normal text-gray-400">/{req.tenant_slug}</span>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="capitalize">{req.plan_slug ?? "plan"}</Badge>
                        <Badge variant="outline">{req.billing_cycle === "yearly" ? "Annuel" : "Mensuel"}</Badge>
                        <span className="inline-flex items-center gap-1 text-xs">
                          {method.icon}
                          {method.label}
                        </span>
                        {req.created_at && (
                          <span className="text-xs text-gray-400">
                            demandé le {new Date(req.created_at).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100">
                      <Hourglass className="w-3 h-3 mr-1" />
                      En attente
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {req.provider_reference && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Référence communiquée par l'établissement :{" "}
                      <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">
                        {req.provider_reference}
                      </code>
                    </p>
                  )}

                  {isConfirming ? (
                    <div className="space-y-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        Confirmer la réception du paiement
                      </p>
                      <Input
                        placeholder="Référence de transaction vérifiée (optionnel)"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                          disabled={confirm.isPending}
                          onClick={() => confirm.mutate({ id: req.id, payment_reference: reference.trim() })}
                        >
                          <CheckCircle className="w-4 h-4" />
                          {confirm.isPending ? "Activation…" : "Activer l'abonnement"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : isRejecting ? (
                    <div className="space-y-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">Motif du rejet (obligatoire)</p>
                      <Textarea
                        placeholder="Ex. : paiement introuvable sur le relevé, montant incorrect…"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1.5"
                          disabled={reject.isPending || rejectReason.trim().length < 3}
                          onClick={() => reject.mutate({ id: req.id, reason: rejectReason.trim() })}
                        >
                          <XCircle className="w-4 h-4" />
                          {reject.isPending ? "Rejet…" : "Rejeter la demande"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setRejectingId(null)}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                        onClick={() => { setConfirmingId(req.id); setRejectingId(null); setReference(req.provider_reference ?? ""); }}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Paiement reçu
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 gap-1.5"
                        onClick={() => { setRejectingId(req.id); setConfirmingId(null); setRejectReason(""); }}
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeter
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
