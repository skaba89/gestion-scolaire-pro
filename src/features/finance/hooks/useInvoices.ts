import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";

export const useInvoices = (tenantId?: string, options?: { page?: number; pageSize?: number }) => {
    const queryClient = useQueryClient();
    const { logCreate, logUpdate, logDelete } = useAuditLog();

    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;

    // ─── List Invoices ────────────────────────────────────────────────────────
    const invoicesQuery = useQuery({
        queryKey: ["invoices", tenantId, page, pageSize],
        queryFn: async () => {
            if (!tenantId) return { invoices: [], totalCount: 0 };
            const { data } = await apiClient.get("/payments/invoices/", {
                params: { page, page_size: pageSize }
            });
            return {
                invoices: Array.isArray(data?.invoices) ? data.invoices : (Array.isArray(data) ? data : []),
                totalCount: data?.totalCount || 0,
            };
        },
        enabled: !!tenantId,
    });

    // ─── Save Invoice (create or update) ─────────────────────────────────────
    const saveInvoiceMutation = useMutation({
        mutationFn: async ({ id, data, items }: {
            id?: string;
            data: {
                student_id: string;
                invoice_number?: string;
                due_date?: string;
                notes?: string;
                has_payment_plan?: boolean;
                installments_count?: number;
            };
            items: Array<{ description: string; amount: number; quantity: number; total: number }>;
        }) => {
            const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
            const body = {
                student_id: data.student_id,
                invoice_number: data.invoice_number,
                total_amount: totalAmount,
                items,
                due_date: data.due_date || null,
                notes: data.notes || null,
                has_payment_plan: data.has_payment_plan || false,
                installments_count: data.installments_count || 1,
            };

            if (id) {
                const { data: updated } = await apiClient.put(`/payments/invoices/${id}/`, body);
                await logUpdate("invoices", id, {}, body);
                return updated;
            } else {
                const { data: created } = await apiClient.post("/payments/invoices/", body);
                await logCreate("invoices", created.invoice_id, body);
                return created;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            toast.success("Facture enregistrée");
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.detail || "Erreur lors de l'enregistrement de la facture";
            toast.error(msg);
        },
    });

    // ─── Delete Invoice ───────────────────────────────────────────────────────
    const deleteInvoiceMutation = useMutation({
        mutationFn: async (invoice: { id: string }) => {
            await apiClient.delete(`/payments/invoices/${invoice.id}/`);
            await logDelete("invoices", invoice.id, invoice);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            toast.success("Facture supprimée");
        },
        onError: () => toast.error("Erreur lors de la suppression"),
    });

    // ─── Generate Invoice Number ───────────────────────────────────────────────
    const generateNumber = async () => {
        if (!tenantId) return "";
        try {
            const year = new Date().getFullYear();
            const { data } = await apiClient.get("/payments/sequence/", {
                params: { prefix: `INV-${year}-` }
            });
            return typeof data === "string" ? data : `INV-${year}-${Date.now().toString().slice(-6)}`;
        } catch {
            return `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
        }
    };

    return {
        invoices: invoicesQuery.data?.invoices || [],
        totalCount: invoicesQuery.data?.totalCount || 0,
        isLoading: invoicesQuery.isLoading,
        saveInvoice: saveInvoiceMutation.mutateAsync,
        isSaving: saveInvoiceMutation.isPending,
        deleteInvoice: deleteInvoiceMutation.mutateAsync,
        generateNumber,
    };
};
