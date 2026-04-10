import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, Clock, CheckCircle, AlertCircle } from "lucide-react";

interface ParentInvoiceStatsProps {
    totalDue: string;
    totalPaid: string;
    count: number;
    overdueCount: number;
}

export const ParentInvoiceStats = ({
    totalDue,
    totalPaid,
    count,
    overdueCount
}: ParentInvoiceStatsProps) => {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20 shadow-sm border-2">
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-orange-600 font-display">
                                {totalDue}
                            </p>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">À payer</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 shadow-sm border-2">
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-green-600 font-display">
                                {totalPaid}
                            </p>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">Payé</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="border-primary/10 shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CreditCard className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold font-display">{count}</p>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">Factures</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className={`border-2 shadow-sm ${overdueCount > 0 ? "border-destructive/20 bg-destructive/5" : "border-primary/10"}`}>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${overdueCount > 0 ? "bg-destructive/20" : "bg-muted"}`}>
                            <AlertCircle className={`w-5 h-5 ${overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                            <p className={`text-2xl font-bold font-display ${overdueCount > 0 ? "text-destructive" : ""}`}>{overdueCount}</p>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">En retard</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
