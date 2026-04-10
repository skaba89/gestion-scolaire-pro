import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";

interface Fee {
    id: string;
    name: string;
    description?: string;
    amount: number;
    created_at?: string;
}

interface FeeSaveData {
    id?: string;
    name: string;
    description?: string;
    amount: number;
}

export const useFees = (tenantId?: string) => {
    const queryClient = useQueryClient();
    const { logCreate, logUpdate, logDelete } = useAuditLog();

    // ─── List Fees ─────────────────────────────────────────────────────────────
    const feesQuery = useQuery({
        queryKey: ["fees", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const { data } = await apiClient.get("/payments/fees/");
            const raw = (data || []);
            return Array.isArray(raw) ? raw : [];
        },
        enabled: !!tenantId,
    });

    // ─── Save Fee (create or update) ──────────────────────────────────────────
    const saveFeeMutation = useMutation({
        mutationFn: async (data: FeeSaveData) => {
            if (data.id) {
                await apiClient.put(`/payments/fees/${data.id}/`, {
                    name: data.name,
                    description: data.description,
                    amount: data.amount,
                });
                await logUpdate("fees", data.id, {}, data);
            } else {
                const { data: newFee } = await apiClient.post("/payments/fees/", {
                    name: data.name,
                    description: data.description,
                    amount: data.amount,
                });
                await logCreate("fees", newFee.id, newFee);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fees"] });
            toast.success("Frais enregistré");
        },
        onError: () => toast.error("Erreur lors de l'enregistrement des frais"),
    });

    // ─── Delete Fee ────────────────────────────────────────────────────────────
    const deleteFeeMutation = useMutation({
        mutationFn: async (fee: Fee) => {
            await apiClient.delete(`/payments/fees/${fee.id}/`);
            await logDelete("fees", fee.id, fee);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fees"] });
            toast.success("Frais supprimé");
        },
        onError: () => toast.error("Erreur lors de la suppression"),
    });

    return {
        fees: feesQuery.data || [],
        isLoading: feesQuery.isLoading,
        saveFee: saveFeeMutation.mutateAsync,
        isSaving: saveFeeMutation.isPending,
        deleteFee: deleteFeeMutation.mutateAsync,
    };
};
