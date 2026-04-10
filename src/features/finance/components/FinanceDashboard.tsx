import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RevenueCharts } from "@/components/finances/RevenueCharts";
import { useCurrency } from "@/hooks/useCurrency";
import { DollarSign, Clock, CheckCircle, AlertCircle, Sparkles, RefreshCw } from "lucide-react";
import { Invoice, Payment } from "../types";
import { RevenueTrendChart } from "@/components/dashboard/widgets/RevenueTrendChart";
import { DebtAgingChart } from "@/components/dashboard/widgets/DebtAgingChart";
import { RevenueByCategoryChart } from "@/components/dashboard/widgets/RevenueByCategoryChart";
import { useTenant } from "@/contexts/TenantContext";
import { useCashFlowForecast } from "@/hooks/useCashFlowForecast";
import { CashFlowForecastChart } from "@/components/admin/dashboard/CashFlowForecastChart";

interface FinanceDashboardProps {
    invoices: Invoice[];
    payments: Payment[];
}

export const FinanceDashboard = ({ invoices, payments }: FinanceDashboardProps) => {
    const { tenant } = useTenant();
    const { currencyCode, formatCurrency } = useCurrency();
    const { forecasts, isLoading: isForecastLoading, generateForecast } = useCashFlowForecast(tenant?.id || "");

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalPending = invoices.reduce((sum, inv) =>
        inv.status !== "PAID" && inv.status !== "CANCELLED"
            ? sum + (Number(inv.total_amount) - Number(inv.paid_amount || 0))
            : sum
        , 0);

    const stats = {
        paid: invoices.filter(i => i.status === "PAID").length,
        overdue: invoices.filter(i => i.status === "OVERDUE").length,
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                                <DollarSign className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-green-600">
                                    {formatCurrency(totalRevenue)}
                                </p>
                                <p className="text-xs text-muted-foreground">Revenus perçus</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-orange-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-orange-600">
                                    {formatCurrency(totalPending)}
                                </p>
                                <p className="text-xs text-muted-foreground">En attente</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.paid}</p>
                                <p className="text-xs text-muted-foreground">Factures payées</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-destructive" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.overdue}</p>
                                <p className="text-xs text-muted-foreground">En retard</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* AI Financial Forecast Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-500" />
                        Prévisions de Trésorerie (IA)
                    </h3>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateForecast.mutate()}
                            disabled={generateForecast.isPending}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${generateForecast.isPending ? 'animate-spin' : ''}`} />
                            {generateForecast.isPending ? 'Calcul en cours...' : 'Actualiser les prévisions'}
                        </Button>
                    </div>
                </div>

                {forecasts && forecasts.length > 0 ? (
                    <CashFlowForecastChart forecasts={forecasts} currency={currencyCode} />
                ) : (
                    <Card className="bg-muted/50 border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <Sparkles className="h-12 w-12 text-muted-foreground/20 mb-4" />
                            <h4 className="text-lg font-medium text-muted-foreground">Aucune prévision disponible</h4>
                            <p className="text-sm text-muted-foreground/80 max-w-md mt-2 mb-6">
                                L'intelligence artificielle peut analyser votre historique de facturation pour projeter votre trésorerie sur les 3 prochains mois.
                            </p>
                            <Button onClick={() => generateForecast.mutate()} disabled={generateForecast.isPending}>
                                {generateForecast.isPending ? 'Analyse en cours...' : 'Générer les prévisions'}
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="flex justify-end gap-2">
                <Button
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700"
                    onClick={async () => {
                        const { apiClient } = await import("@/api/client");
                        toast.promise(
                            apiClient.post("/payments/send-reminders/", {}),
                            {
                                loading: "Envoi des relances en cours...",
                                success: (res) => `${res.data?.sent ?? 0} relance(s) envoyée(s) avec succès`,
                                error: "Erreur lors de l'envoi des relances"
                            }
                        );
                    }}
                    disabled={invoices.filter(i => i.status === "OVERDUE").length === 0}
                >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Envoyer les relances (Dettes exigibles)
                </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                <RevenueTrendChart />
                <DebtAgingChart />
                <RevenueByCategoryChart />
            </div>

            <RevenueCharts
                payments={payments}
                invoices={invoices}
            />
        </div>
    );
};
