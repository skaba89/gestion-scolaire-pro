import { useQuery } from "@tanstack/react-query";
import { analyticsQueries } from "@/queries/analytics";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

const COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--secondary))",
    "hsl(var(--accent))",
    "hsl(var(--info))",
    "hsl(var(--warning))",
    "hsl(var(--success))",
];

export const RevenueByCategoryChart = () => {
    const { tenant } = useTenant();
    const { formatCurrency, formatCurrencyCompact } = useCurrency();
    const { data: categoryData, isLoading } = useQuery(
        analyticsQueries.revenueByCategory(tenant?.id || "")
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
                    <PieIcon className="w-4 h-4 text-primary" />
                    Répartition par Catégorie
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    {!categoryData || categoryData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                            Pas de données disponibles
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="total"
                                    nameKey="category"
                                >
                                    {categoryData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => [formatCurrency(value), "Total"]}
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: "8px",
                                        fontSize: "12px"
                                    }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    formatter={(value) => <span className="text-[10px] text-muted-foreground">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
