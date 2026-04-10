import { useQuery } from "@tanstack/react-query";
import { analyticsQueries } from "@/queries/analytics";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";
import { Hourglass } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";

const COLORS = [
    "hsl(var(--primary))",    // Current
    "hsl(var(--warning))",    // 0-30
    "hsl(45, 93%, 47%)",      // 30-60
    "hsl(25, 95%, 53%)",      // 60-90
    "hsl(var(--destructive))" // 90+
];

export const DebtAgingChart = () => {
    const { tenant } = useTenant();
    const { formatCurrency } = useCurrency();
    const { data: agingData, isLoading } = useQuery(
        analyticsQueries.debtAging(tenant?.id || "")
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
                    <Hourglass className="w-4 h-4 text-primary" />
                    Balance Âgée des Créances
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={agingData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" horizontal={false} />
                            <XAxis type="number" hide />
                            <YAxis
                                dataKey="bucket"
                                type="category"
                                fontSize={10}
                                width={80}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val: string) => {
                                    const labels: Record<string, string> = {
                                        current: 'Courant',
                                        '1_30': '1-30 jours',
                                        '31_60': '31-60 jours',
                                        '61_90': '61-90 jours',
                                        over_90: '90+ jours'
                                    };
                                    return labels[val] || val;
                                }}
                            />
                            <Tooltip
                                cursor={{ fill: "hsl(var(--primary) / 0.05)" }}
                                contentStyle={{
                                    backgroundColor: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                    fontSize: "12px"
                                }}
                                formatter={(value: number) => [formatCurrency(value), "Montant"]}
                            />
                            <Bar
                                dataKey="amount"
                                radius={[0, 4, 4, 0]}
                                barSize={20}
                            >
                                {agingData?.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {agingData && agingData.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-muted/30 flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Total exigible:</span>
                        <span className="font-bold text-primary">
                            {formatCurrency(agingData.reduce((sum: number, item: any) => sum + Number(item.amount), 0))}
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
