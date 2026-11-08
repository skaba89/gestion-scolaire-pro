import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, IDEMPOTENCY_HEADER, newIdempotencyKey } from "@/api/client";
import { toast } from "sonner";
import { parsePaymentsResponse } from "../utils/financeReadContracts";

export const usePayments = (tenantId?: string) => {
    const queryClient = useQueryClient();

    // ─── List Payments ────────────────────────────────────────────────────────
    const paymentsQuery = useQuery({
        queryKey: ["payments", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const { data } = await apiClient.get("/payments/payments/");
            return parsePaymentsResponse(data);
        },
        enabled: !!tenantId,
    });

    // ─── Register Payment (atomic) ─────────────────────────────────────────────
    const registerPaymentMutation = useMutation({
        mutationFn: async (params: {
            invoiceId: string;
            amount: number;
            method: string;
            reference?: string;
            notes?: string;
            payment_date?: string;
        }) => {
            const { data } = await apiClient.post("/payments/register/", {
                invoice_id: params.invoiceId,
                amount: params.amount,
                method: params.method,
                reference: params.reference,
                notes: params.notes,
                // La date saisie dans l'écran n'était jamais transmise : tout
                // paiement était daté du jour de saisie.
                payment_date: params.payment_date || undefined,
            }, {
                // Une clé par encaissement, identique pour chacun de ses rejeux
                // (réponse perdue, 502/504) : le serveur ne l'enregistre qu'une fois.
                headers: { [IDEMPOTENCY_HEADER]: newIdempotencyKey() },
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            toast.success("Paiement enregistré");
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.detail || error.message || "Erreur lors de l'enregistrement du paiement";
            toast.error(msg);
        },
    });

    // ─── Generate Reference ────────────────────────────────────────────────────
    const generateReference = async (prefix?: string) => {
        if (!tenantId) return "";
        const effectivePrefix = prefix || `PAY-`;
        try {
            const { data } = await apiClient.get("/payments/sequence/", {
                params: { prefix: effectivePrefix }
            });
            return typeof data === "string" ? data : `${effectivePrefix}${Date.now().toString().slice(-6)}`;
        } catch {
            return `${effectivePrefix}${Date.now().toString().slice(-6)}`;
        }
    };

    // ─── Reverse Payment ───────────────────────────────────────────────────────
    const reversePaymentMutation = useMutation({
        mutationFn: async ({ paymentId, notes }: { paymentId: string; notes?: string }) => {
            const { data } = await apiClient.post(`/payments/${paymentId}/reverse/`, { notes });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            toast.success("Paiement annulé avec succès");
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.detail || error.message || "Erreur lors de l'annulation";
            toast.error(msg);
        },
    });

    return {
        payments: paymentsQuery.data || [],
        isLoading: paymentsQuery.isLoading,
        isError: paymentsQuery.isError,
        error: paymentsQuery.error,
        refetch: paymentsQuery.refetch,
        registerPayment: registerPaymentMutation.mutateAsync,
        isRegistering: registerPaymentMutation.isPending,
        generateReference,
        reversePayment: reversePaymentMutation.mutateAsync,
    };
};
