import { useQuery } from "@tanstack/react-query";
import { analyticsQueries } from "@/queries/analytics";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";
import { TrendingUp } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

export const RevenueTrendChart = () => {
    const { tenant } = useTenant();
    const { formatCurrency } = useCurrency();
    const { data: trendData, isLoading } = useQuery(
        analyticsQueries.revenueTrend(tenant?.id || "")
    );

    if (isLoading) {
        return (
            <Card className="border-none shadow-sm h-full">
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[250px] w-full" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-none shadow-sm h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Flux de Trésorerie (12 mois)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
                            <XAxis
                                dataKey="month_val"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => {
                                    const [year, month] = val.split("-");
                                    const date = new Date(parseInt(year), parseInt(month) - 1);
                                    return date.toLocaleDateString("fr-FR", { month: "short" });
                                }}
                            />
                            <YAxis
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => `${val / 1000}k`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                    fontSize: "12px"
                                }}
                                formatter={(value: number) => [formatCurrency(value), ""]}
                            />
                            <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} />
                            <Line
                                type="monotone"
                                dataKey="revenue_expected"
                                name="Facturé (Prévision)"
                                stroke="hsl(var(--muted-foreground))"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="revenue_collected"
                                name="Perçu (Réel)"
                                stroke="hsl(var(--primary))"
                                strokeWidth={3}
                                dot={{ r: 4, fill: "hsl(var(--primary))" }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};
