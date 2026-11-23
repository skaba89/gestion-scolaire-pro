import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RevenueCharts } from "@/components/finances/RevenueCharts";
import { useCurrency } from "@/hooks/useCurrency";
import { DollarSign, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Invoice, Payment } from "../types";
import type { FinanceOverview } from "../utils/financeOverviewApi";
import { RevenueTrendChart } from "@/components/dashboard/widgets/RevenueTrendChart";
import { DebtAgingChart } from "@/components/dashboard/widgets/DebtAgingChart";
import { RevenueByCategoryChart } from "@/components/dashboard/widgets/RevenueByCategoryChart";

interface FinanceDashboardProps {
    invoices: Invoice[];
    payments: Payment[];
    overview: FinanceOverview;
}

export const FinanceDashboard = ({ invoices, payments, overview }: FinanceDashboardProps) => {
    const { formatCurrency } = useCurrency();

    // Totals come from the full tenant-scoped backend aggregate, never from
    // the paginated invoice or payment lists visible in the tables.
    const totalRevenue = overview.received_amount;
    const totalPending = overview.outstanding_amount;
    const stats = {
        paid: overview.paid_invoices,
        overdue: overview.overdue_invoices,
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

            {/* Pas de « prévision de trésorerie (IA) » : l'ancienne section projetait la trésorerie avec
                des constantes inventées (+2 % de croissance par mois, dépenses = 60 % des recettes alors
                qu'aucun module de dépenses n'existe, indice de confiance arbitraire) — ANALYTICS-MOCK-01.
                Les graphiques ci-dessus ne montrent que des données réelles. */}
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

            <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                    Détail graphique limité aux lignes de la page actuellement chargée.
                    Les indicateurs financiers globaux ci-dessus couvrent tout l'établissement.
                </p>
                <RevenueCharts payments={payments} invoices={invoices} />
            </div>
        </div>
    );
};
