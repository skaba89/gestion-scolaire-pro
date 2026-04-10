import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Area,
    ComposedChart,
} from "recharts";

interface CashFlowForecast {
    forecast_date: string;
    period_start: string;
    period_end: string;
    expected_revenue: number;
    expected_collections: number;
    expected_expenses: number;
    net_cash_flow: number;
    collection_rate: number;
    risk_level: string;
    risk_factors: string[];
    confidence_score: number;
}

interface Props {
    forecasts: CashFlowForecast[];
    currency?: string;
}

const getRiskColor = (level: string) => {
    switch (level) {
        case "CRITICAL": return "bg-red-100 text-red-800 border-red-200";
        case "HIGH": return "bg-orange-100 text-orange-800 border-orange-200";
        case "MODERATE": return "bg-yellow-100 text-yellow-800 border-yellow-200";
        case "LOW": return "bg-green-100 text-green-800 border-green-200";
        default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
};

const getRiskIcon = (level: string) => {
    switch (level) {
        case "CRITICAL": return "🔴";
        case "HIGH": return "🟠";
        case "MODERATE": return "🟡";
        case "LOW": return "🟢";
        default: return "⚪";
    }
};

export const CashFlowForecastChart = ({ forecasts, currency: _currencyProp }: Props) => {
    const { formatCurrency } = useCurrency();

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    };

    // Prepare chart data
    const chartData = forecasts.map(f => ({
        date: formatDate(f.period_start),
        revenue: f.expected_revenue,
        collections: f.expected_collections,
        expenses: f.expected_expenses,
        netCashFlow: f.net_cash_flow,
        confidence: f.confidence_score,
        riskLevel: f.risk_level,
    }));

    // Find worst forecast
    const worstForecast = forecasts.reduce((worst, current) => {
        const riskOrder = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
        const currentRisk = riskOrder[current.risk_level as keyof typeof riskOrder] || 0;
        const worstRisk = riskOrder[worst.risk_level as keyof typeof riskOrder] || 0;
        return currentRisk > worstRisk ? current : worst;
    }, forecasts[0]);

    const hasRisk = worstForecast.risk_level === "CRITICAL" || worstForecast.risk_level === "HIGH";

    return (
        <div className="space-y-6">
            {/* Risk Alert */}
            {hasRisk && (
                <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-transparent">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-6 h-6 text-orange-600" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="font-bold text-orange-900">Alerte Trésorerie</p>
                                    <Badge className={getRiskColor(worstForecast.risk_level)}>
                                        {getRiskIcon(worstForecast.risk_level)} {worstForecast.risk_level}
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Risque détecté pour {formatDate(worstForecast.period_start)}
                                </p>
                                <div className="space-y-1">
                                    {worstForecast.risk_factors.map((factor, idx) => (
                                        <p key={idx} className="text-sm text-orange-800">• {factor}</p>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Prévisions de Trésorerie (3 mois)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis
                                tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                            />
                            <Tooltip
                                formatter={(value: number) => formatCurrency(value)}
                                labelStyle={{ color: '#000' }}
                            />
                            <Legend />

                            <Line
                                type="monotone"
                                dataKey="revenue"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                name="Revenus attendus"
                                dot={{ r: 4 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="collections"
                                stroke="#10b981"
                                strokeWidth={2}
                                name="Encaissements prévus"
                                dot={{ r: 4 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="expenses"
                                stroke="#ef4444"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                name="Dépenses estimées"
                                dot={{ r: 4 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="netCashFlow"
                                stroke="#8b5cf6"
                                strokeWidth={3}
                                name="Flux net"
                                dot={{ r: 5 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Forecast Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {forecasts.map((forecast, idx) => (
                    <Card key={idx} className="border">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium">
                                    {formatDate(forecast.period_start)}
                                </CardTitle>
                                <Badge className={getRiskColor(forecast.risk_level)}>
                                    {getRiskIcon(forecast.risk_level)}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Revenus</span>
                                <span className="font-medium">{formatCurrency(forecast.expected_revenue)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Encaissements</span>
                                <span className="font-medium text-green-600">
                                    {formatCurrency(forecast.expected_collections)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Dépenses</span>
                                <span className="font-medium text-red-600">
                                    {formatCurrency(forecast.expected_expenses)}
                                </span>
                            </div>
                            <div className="pt-2 border-t">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold">Flux net</span>
                                    <div className="flex items-center gap-1">
                                        {forecast.net_cash_flow > 0 ? (
                                            <TrendingUp className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <TrendingDown className="w-4 h-4 text-red-600" />
                                        )}
                                        <span className={`font-bold ${forecast.net_cash_flow > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatCurrency(forecast.net_cash_flow)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                                <span>Confiance</span>
                                <span>{(forecast.confidence_score * 100).toFixed(0)}%</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};
