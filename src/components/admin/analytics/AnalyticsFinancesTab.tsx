import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { DollarSign } from "lucide-react";

interface RevenueData {
    month: string;
    montant: number;
}

interface AnalyticsFinancesTabProps {
    revenueData: RevenueData[];
    totalRevenue: number;
    collectedRevenue: number;
    pendingRevenue: number;
    formatCurrency: (amount: number) => string;
    formatCurrencyCompact: (amount: number) => string;
}

export const AnalyticsFinancesTab = ({
    revenueData,
    totalRevenue,
    collectedRevenue,
    pendingRevenue,
    formatCurrency,
    formatCurrencyCompact
}: AnalyticsFinancesTabProps) => {
    return (
        <div className="space-y-6">
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <DollarSign className="w-5 h-5 text-primary" />
                        Évolution des Recettes
                    </CardTitle>
                    <CardDescription>Paiements reçus sur les 12 derniers mois</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-72">
                        {revenueData && revenueData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={revenueData}>
                                    <defs>
                                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(217, 91%, 50%)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="hsl(217, 91%, 50%)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrencyCompact(v)} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "8px",
                                        }}
                                        formatter={(value: number) => [formatCurrency(value), "Montant"]}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="montant"
                                        stroke="hsl(217, 91%, 50%)"
                                        fill="url(#revenueGradient)"
                                        strokeWidth={3}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground italic">
                                Aucune donnée disponible
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-3 gap-4">
                <Card className="border-l-4 border-l-primary shadow-sm">
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Total facturation</p>
                        <p className="text-2xl font-bold mt-1">{formatCurrency(totalRevenue || 0)}</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-600 shadow-sm">
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Montant encaissé</p>
                        <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(collectedRevenue || 0)}</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-600 shadow-sm">
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Reste à recouvrer</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(pendingRevenue || 0)}</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
