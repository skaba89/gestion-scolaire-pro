import { apiClient } from "@/api/client";

export interface FinanceOverview {
    total_invoices: number;
    paid_invoices: number;
    overdue_invoices: number;
    outstanding_amount: number;
    completed_payments: number;
    received_amount: number;
}

export async function fetchFinanceOverview(): Promise<FinanceOverview> {
    const { data } = await apiClient.get("/payments/overview/");
    const counts = ["total_invoices", "paid_invoices", "overdue_invoices", "completed_payments"] as const;
    const amounts = ["outstanding_amount", "received_amount"] as const;
    if (!data || typeof data !== "object" ||
        counts.some(k => !Number.isSafeInteger(data[k]) || data[k] < 0) ||
        amounts.some(k => typeof data[k] !== "number" || !Number.isFinite(data[k]) || data[k] < 0) ||
        data.paid_invoices + data.overdue_invoices > data.total_invoices) {
        throw new Error("Statistiques financières invalides");
    }
    return data as FinanceOverview;
}
