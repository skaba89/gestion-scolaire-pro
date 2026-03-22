import { supabase } from "@/integrations/supabase/client";

export type ForecastRiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface PaymentTrend {
    month: string;
    totalRevenue: number;
    collectedRevenue: number;
    collectionRate: number;
    averageDelay: number; // days
}

export interface SeasonalityFactor {
    month: number; // 1-12
    factor: number; // multiplier (e.g., 1.3 for +30%)
    reason: string;
}

export interface CashFlowForecast {
    forecastDate: string;
    periodStart: string;
    periodEnd: string;
    expectedRevenue: number;
    expectedCollections: number;
    expectedExpenses: number;
    netCashFlow: number;
    collectionRate: number;
    averagePaymentDelay: number;
    riskLevel: ForecastRiskLevel;
    riskFactors: string[];
    confidenceScore: number; // 0-1
}

/**
 * Cash Flow Forecasting Engine
 */
export const cashFlowForecasting = {
    /**
     * Analyze payment trends over the last N months
     */
    async analyzePaymentTrends(
        tenantId: string,
        monthsBack: number = 6
    ): Promise<PaymentTrend[]> {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsBack);

        // Get all invoices in the period
        const { data: invoices } = await supabase
            .from("invoices")
            .select(`
                id,
                total_amount,
                paid_amount,
                due_date,
                created_at,
                payments!inner(amount, payment_date)
            `)
            .eq("tenant_id", tenantId)
            .gte("created_at", startDate.toISOString());

        if (!invoices) return [];

        // Group by month
        const monthlyData: { [key: string]: PaymentTrend } = {};

        invoices.forEach((invoice: any) => {
            const month = new Date(invoice.created_at).toISOString().slice(0, 7); // YYYY-MM

            if (!monthlyData[month]) {
                monthlyData[month] = {
                    month,
                    totalRevenue: 0,
                    collectedRevenue: 0,
                    collectionRate: 0,
                    averageDelay: 0,
                };
            }

            monthlyData[month].totalRevenue += invoice.total_amount;
            monthlyData[month].collectedRevenue += invoice.paid_amount || 0;

            // Calculate payment delay
            if (invoice.payments && invoice.payments.length > 0) {
                const firstPayment = invoice.payments[0];
                const dueDate = new Date(invoice.due_date);
                const paymentDate = new Date(firstPayment.payment_date);
                const delay = Math.max(0, Math.floor((paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                monthlyData[month].averageDelay += delay;
            }
        });

        // Calculate collection rates
        const trends = Object.values(monthlyData).map(trend => ({
            ...trend,
            collectionRate: trend.totalRevenue > 0
                ? (trend.collectedRevenue / trend.totalRevenue) * 100
                : 0,
        }));

        return trends.sort((a, b) => a.month.localeCompare(b.month));
    },

    /**
     * Calculate average collection rate by fee type
     */
    async calculateCollectionRate(
        tenantId: string,
        monthsBack: number = 6
    ): Promise<{ overall: number; byType: { [key: string]: number } }> {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsBack);

        const { data: invoices } = await supabase
            .from("invoices")
            .select("total_amount, paid_amount, description")
            .eq("tenant_id", tenantId)
            .gte("created_at", startDate.toISOString());

        if (!invoices || invoices.length === 0) {
            return { overall: 0, byType: {} };
        }

        let totalRevenue = 0;
        let totalCollected = 0;
        const byType: { [key: string]: { total: number; collected: number } } = {};

        invoices.forEach((invoice: any) => {
            totalRevenue += invoice.total_amount;
            totalCollected += invoice.paid_amount || 0;

            // Extract fee type from description (simplified)
            const type = invoice.description?.includes("Scolarité") ? "Scolarité" :
                invoice.description?.includes("Cantine") ? "Cantine" :
                    invoice.description?.includes("Transport") ? "Transport" : "Autre";

            if (!byType[type]) {
                byType[type] = { total: 0, collected: 0 };
            }

            byType[type].total += invoice.total_amount;
            byType[type].collected += invoice.paid_amount || 0;
        });

        const overall = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;

        const byTypeRates: { [key: string]: number } = {};
        Object.entries(byType).forEach(([type, data]) => {
            byTypeRates[type] = data.total > 0 ? (data.collected / data.total) * 100 : 0;
        });

        return { overall, byType: byTypeRates };
    },

    /**
     * Detect seasonality patterns
     */
    detectSeasonality(): SeasonalityFactor[] {
        // Hardcoded seasonality for school context
        return [
            { month: 9, factor: 1.5, reason: "Rentrée scolaire" },
            { month: 10, factor: 1.2, reason: "Début d'année" },
            { month: 1, factor: 1.1, reason: "Nouveau trimestre" },
            { month: 4, factor: 1.1, reason: "Dernier trimestre" },
            { month: 7, factor: 0.6, reason: "Vacances d'été" },
            { month: 8, factor: 0.7, reason: "Vacances d'été" },
            { month: 12, factor: 0.9, reason: "Vacances de Noël" },
        ];
    },

    /**
     * Forecast cash flow for the next N months
     */
    async forecastCashFlow(
        tenantId: string,
        monthsAhead: number = 3
    ): Promise<CashFlowForecast[]> {
        // 1. Analyze historical trends
        const trends = await this.analyzePaymentTrends(tenantId, 6);

        if (trends.length < 3) {
            throw new Error("Insufficient historical data. Need at least 3 months of payment history.");
        }

        // 2. Calculate baseline metrics
        const avgRevenue = trends.reduce((sum, t) => sum + t.totalRevenue, 0) / trends.length;
        const avgCollectionRate = trends.reduce((sum, t) => sum + t.collectionRate, 0) / trends.length;
        const avgDelay = trends.reduce((sum, t) => sum + t.averageDelay, 0) / trends.length;

        // 3. Detect trend (linear regression)
        const n = trends.length;
        const xMean = (n - 1) / 2;
        const yMean = avgRevenue;

        let numerator = 0;
        let denominator = 0;

        trends.forEach((trend, i) => {
            numerator += (i - xMean) * (trend.totalRevenue - yMean);
            denominator += Math.pow(i - xMean, 2);
        });

        const slope = denominator > 0 ? numerator / denominator : 0;

        // 4. Get seasonality factors
        const seasonality = this.detectSeasonality();

        // 5. Generate forecasts
        const forecasts: CashFlowForecast[] = [];
        const now = new Date();

        for (let i = 1; i <= monthsAhead; i++) {
            const forecastDate = new Date(now);
            forecastDate.setMonth(forecastDate.getMonth() + i);

            const periodStart = new Date(forecastDate.getFullYear(), forecastDate.getMonth(), 1);
            const periodEnd = new Date(forecastDate.getFullYear(), forecastDate.getMonth() + 1, 0);

            // Apply trend
            const trendAdjustedRevenue = avgRevenue + (slope * (n + i - 1));

            // Apply seasonality
            const monthFactor = seasonality.find(s => s.month === forecastDate.getMonth() + 1);
            const seasonalRevenue = trendAdjustedRevenue * (monthFactor?.factor || 1);

            // Calculate expected collections
            const expectedCollections = seasonalRevenue * (avgCollectionRate / 100);

            // Estimate expenses (simplified - could be enhanced)
            const expectedExpenses = seasonalRevenue * 0.7; // Assume 70% operating costs

            const netCashFlow = expectedCollections - expectedExpenses;

            // Assess risk
            const { riskLevel, riskFactors } = this.assessRisk(
                netCashFlow,
                avgCollectionRate,
                trends
            );

            // Calculate confidence (decreases with distance)
            const confidenceScore = Math.max(0.5, 1 - (i * 0.15));

            forecasts.push({
                forecastDate: forecastDate.toISOString().split('T')[0],
                periodStart: periodStart.toISOString().split('T')[0],
                periodEnd: periodEnd.toISOString().split('T')[0],
                expectedRevenue: Math.round(seasonalRevenue),
                expectedCollections: Math.round(expectedCollections),
                expectedExpenses: Math.round(expectedExpenses),
                netCashFlow: Math.round(netCashFlow),
                collectionRate: Math.round(avgCollectionRate * 10) / 10,
                averagePaymentDelay: Math.round(avgDelay),
                riskLevel,
                riskFactors,
                confidenceScore: Math.round(confidenceScore * 100) / 100,
            });
        }

        return forecasts;
    },

    /**
     * Assess financial risk based on forecast
     */
    assessRisk(
        netCashFlow: number,
        collectionRate: number,
        trends: PaymentTrend[]
    ): { riskLevel: ForecastRiskLevel; riskFactors: string[] } {
        const riskFactors: string[] = [];
        let riskScore = 0;

        // Negative cash flow
        if (netCashFlow < 0) {
            riskScore += 40;
            riskFactors.push("Flux de trésorerie négatif projeté");
        }

        // Low collection rate
        if (collectionRate < 70) {
            riskScore += 30;
            riskFactors.push(`Taux de recouvrement faible (${collectionRate.toFixed(1)}%)`);
        } else if (collectionRate < 80) {
            riskScore += 15;
            riskFactors.push(`Taux de recouvrement modéré (${collectionRate.toFixed(1)}%)`);
        }

        // Declining trend
        if (trends.length >= 3) {
            const recentTrends = trends.slice(-3);
            const isDecline = recentTrends.every((t, i) =>
                i === 0 || t.totalRevenue < recentTrends[i - 1].totalRevenue
            );

            if (isDecline) {
                riskScore += 20;
                riskFactors.push("Tendance à la baisse des revenus");
            }
        }

        // Very low cash flow
        if (netCashFlow > 0 && netCashFlow < 100000) {
            riskScore += 10;
            riskFactors.push("Marge de trésorerie faible");
        }

        // Determine risk level
        let riskLevel: ForecastRiskLevel;
        if (riskScore >= 70) riskLevel = "CRITICAL";
        else if (riskScore >= 50) riskLevel = "HIGH";
        else if (riskScore >= 30) riskLevel = "MODERATE";
        else riskLevel = "LOW";

        return { riskLevel, riskFactors };
    },

    /**
     * Identify critical financial risks
     */
    async identifyRisks(tenantId: string): Promise<{
        hasRisk: boolean;
        riskLevel: ForecastRiskLevel;
        message: string;
        recommendations: string[];
    }> {
        const forecasts = await this.forecastCashFlow(tenantId, 3);

        // Check for critical risks in next 3 months
        const criticalForecasts = forecasts.filter(f =>
            f.riskLevel === "CRITICAL" || f.riskLevel === "HIGH"
        );

        if (criticalForecasts.length === 0) {
            return {
                hasRisk: false,
                riskLevel: "LOW",
                message: "Situation financière stable",
                recommendations: [],
            };
        }

        const worstForecast = criticalForecasts[0];
        const recommendations: string[] = [];

        if (worstForecast.netCashFlow < 0) {
            recommendations.push("Intensifier les relances de paiement");
            recommendations.push("Envisager un plan de réduction des dépenses");
        }

        if (worstForecast.collectionRate < 70) {
            recommendations.push("Mettre en place des incitations au paiement anticipé");
            recommendations.push("Revoir les modalités de paiement (échéanciers)");
        }

        recommendations.push("Planifier une réunion financière d'urgence");

        return {
            hasRisk: true,
            riskLevel: worstForecast.riskLevel,
            message: `Risque ${worstForecast.riskLevel} détecté pour ${worstForecast.periodStart}`,
            recommendations,
        };
    }
};
