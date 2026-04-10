import { Card, CardContent } from "@/components/ui/card";
import { FileText, Calculator, Building2 } from "lucide-react";

interface AccountingStatsProps {
    totalInvoiced: number;
    totalPaid: number;
    balance: number;
    invoiceCount: number;
    paymentCount: number;
    formatCurrency: (amount: number) => string;
}

export const AccountingStats = ({
    totalInvoiced,
    totalPaid,
    balance,
    invoiceCount,
    paymentCount,
    formatCurrency,
}: AccountingStatsProps) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                            <FileText className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{formatCurrency(totalInvoiced)}</p>
                            <p className="text-sm text-muted-foreground">Total facturé ({invoiceCount} factures)</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                            <Calculator className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{formatCurrency(totalPaid)}</p>
                            <p className="text-sm text-muted-foreground">Total encaissé ({paymentCount} paiements)</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${balance > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                            <Building2 className={`h-6 w-6 ${balance > 0 ? "text-amber-600" : "text-green-600"}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{formatCurrency(balance)}</p>
                            <p className="text-sm text-muted-foreground">Solde à encaisser</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
