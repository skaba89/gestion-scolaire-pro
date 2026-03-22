/**
 * useFinances Hook
 * Consolidated hook combining invoices and payments management
 * Provides a unified interface for all finance-related operations
 */

import { useInvoices } from "./useInvoices";
import { usePayments } from "./usePayments";
import { useTenantStore } from "@/stores/tenantStore";

export interface UseFinancesOptions {
    page?: number;
    pageSize?: number;
}

/**
 * Consolidated finance hook that combines invoices and payments
 * 
 * @example
 * ```tsx
 * const { 
 *   invoices, 
 *   payments, 
 *   saveInvoice, 
 *   registerPayment 
 * } = useFinances();
 * ```
 */
export const useFinances = (options?: UseFinancesOptions) => {
    const currentTenant = useTenantStore((state) => state.currentTenant);
    const tenantId = currentTenant?.id;

    // Invoices management
    const {
        invoices,
        totalCount: invoicesTotalCount,
        isLoading: isLoadingInvoices,
        saveInvoice,
        isSaving: isSavingInvoice,
        deleteInvoice,
        generateNumber: generateInvoiceNumber,
    } = useInvoices(tenantId, options);

    // Payments management
    const {
        payments,
        isLoading: isLoadingPayments,
        registerPayment,
        isRegistering: isRegisteringPayment,
        generateReference: generatePaymentReference,
        reversePayment,
    } = usePayments(tenantId);

    // Combined statistics
    const stats = {
        totalInvoices: invoicesTotalCount,
        totalPayments: payments.length,
        totalRevenue: payments.reduce((sum, p) => sum + (p.amount || 0), 0),
        pendingAmount: invoices
            .filter((inv) => inv.status !== "PAID")
            .reduce((sum, inv) => sum + (inv.total_amount || 0) - (inv.paid_amount || 0), 0),
    };

    return {
        // Invoices
        invoices,
        invoicesTotalCount,
        isLoadingInvoices,
        saveInvoice,
        isSavingInvoice,
        deleteInvoice,
        generateInvoiceNumber,

        // Payments
        payments,
        isLoadingPayments,
        registerPayment,
        isRegisteringPayment,
        generatePaymentReference,
        reversePayment,

        // Combined states
        isLoading: isLoadingInvoices || isLoadingPayments,

        // Statistics
        stats,

        // Utility
        tenantId,
    };
};
