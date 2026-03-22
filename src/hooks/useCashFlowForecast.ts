/**
 * useCashFlowForecast — Sovereign replacement for Supabase cash_flow_forecasts table + Edge Function.
 * Generates forecast from real financial data via the analytics API.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export interface CashFlowForecast {
    id: string;
    forecast_date: string;
    period_start: string;
    period_end: string;
    expected_revenue: number;
    expected_collections: number;
    expected_expenses: number;
    net_cash_flow: number;
    collection_rate: number;
    risk_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
    risk_factors: string[];
    confidence_score: number;
    created_at: string;
}

export const useCashFlowForecast = (tenantId: string) => {
    const queryClient = useQueryClient();

    // Fetch forecasts — derived from revenue trend data
    const { data: forecasts, isLoading } = useQuery({
        queryKey: ["cash-flow-forecasts", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            // Use revenue trend as the base for forecasting
            const { data } = await apiClient.get("/analytics/revenue-trend", {
                params: { months: 6 }
            });
            const trend: Array<{ period: string; revenue: number; paid: number; pending: number }> = data || [];

            // Generate simple 3-month forecast from trend average
            const avgRevenue = trend.length > 0
                ? trend.reduce((s, r) => s + r.revenue, 0) / trend.length
                : 0;
            const avgCollection = trend.length > 0
                ? trend.reduce((s, r) => s + r.paid, 0) / trend.length
                : 0;
            const collectionRate = avgRevenue > 0 ? (avgCollection / avgRevenue) * 100 : 0;

            const now = new Date();
            return [1, 2, 3].map((monthOffset): CashFlowForecast => {
                const forecastDate = new Date(now);
                forecastDate.setMonth(forecastDate.getMonth() + monthOffset);
                const periodStart = new Date(forecastDate);
                periodStart.setDate(1);
                const periodEnd = new Date(forecastDate);
                periodEnd.setMonth(periodEnd.getMonth() + 1, 0);

                const expectedRevenue = avgRevenue * (1 + 0.02 * monthOffset); // +2% growth per month
                const expectedCollections = expectedRevenue * (collectionRate / 100);
                const expectedExpenses = expectedRevenue * 0.6; // Estimate 60% expenses
                const netCashFlow = expectedCollections - expectedExpenses;

                const riskLevel: CashFlowForecast["risk_level"] =
                    collectionRate < 50 ? "CRITICAL" :
                        collectionRate < 65 ? "HIGH" :
                            collectionRate < 80 ? "MODERATE" : "LOW";

                return {
                    id: `forecast-${monthOffset}`,
                    forecast_date: forecastDate.toISOString().split("T")[0],
                    period_start: periodStart.toISOString().split("T")[0],
                    period_end: periodEnd.toISOString().split("T")[0],
                    expected_revenue: Math.round(expectedRevenue),
                    expected_collections: Math.round(expectedCollections),
                    expected_expenses: Math.round(expectedExpenses),
                    net_cash_flow: Math.round(netCashFlow),
                    collection_rate: Math.round(collectionRate),
                    risk_level: riskLevel,
                    risk_factors: collectionRate < 80 ? ["Taux de recouvrement insuffisant"] : [],
                    confidence_score: Math.max(0.5, 1 - monthOffset * 0.1),
                    created_at: now.toISOString(),
                };
            });
        },
        enabled: !!tenantId,
    });

    // Regenerate forecast (just refetches — computation is live from DB)
    const generateForecast = useMutation({
        mutationFn: async () => {
            // Invalidate and refetch from analytics API
            await apiClient.get("/analytics/revenue-trend", { params: { months: 6 } });
            return { refreshed: true };
        },
        onSuccess: () => {
            toast.success("Prévisions mises à jour avec succès");
            queryClient.invalidateQueries({ queryKey: ["cash-flow-forecasts", tenantId] });
        },
        onError: () => {
            toast.error("Erreur lors du calcul des prévisions");
        },
    });

    return { forecasts, isLoading, generateForecast };
};
