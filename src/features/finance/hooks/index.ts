/**
 * Finance Hooks - Centralized exports
 * 
 * Usage examples:
 * 
 * // Use consolidated hook (recommended for most cases)
 * import { useFinances } from '@/features/finance/hooks';
 * const { invoices, payments, saveInvoice, registerPayment } = useFinances();
 * 
 * // Use individual hooks (for specific use cases)
 * import { useInvoices, usePayments } from '@/features/finance/hooks';
 * const { invoices } = useInvoices(tenantId);
 * const { payments } = usePayments(tenantId);
 */

export { useInvoices } from "./useInvoices";
export { usePayments } from "./usePayments";
export { useFinances } from "./useFinances";
