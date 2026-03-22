import { useState } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreditCard, RotateCcw, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Payment } from "../types";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useFinances } from "../hooks/useFinances";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";

interface PaymentHistoryProps {
    payments: Payment[];
    isLoading: boolean;
}

export const PaymentHistory = ({ payments, isLoading }: PaymentHistoryProps) => {
    const { formatCurrency } = useCurrency();
    const { StudentLabel } = useStudentLabel();
    const { tenant } = useTenant();
    const { reversePayment } = useFinances(tenant?.id);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const totalItems = payments.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginatedPayments = payments.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const handleReverse = async (paymentId: string) => {
        if (!confirm("Voulez-vous vraiment annuler ce paiement ? Cette action est irréversible comptablement (une écriture d'annulation sera créée).")) return;

        try {
            await reversePayment({ paymentId });
        } catch (error) {
            // Error already handled by toast in the hook
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Historique des Paiements ({payments.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <TableSkeleton columns={7} rows={5} />
                ) : payments.length === 0 ? (
                    <EmptyState
                        icon={CreditCard}
                        title="Aucun paiement enregistré"
                        description="L'historique des paiements apparaîtra ici une fois que vous aurez encaissé des règlements."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Facture</TableHead>
                                    <TableHead>{StudentLabel}</TableHead>
                                    <TableHead>Montant</TableHead>
                                    <TableHead>Méthode</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedPayments.map((payment) => (
                                    <TableRow
                                        key={payment.id}
                                        className={payment.status === 'REVERSED' ? "opacity-50 grayscale bg-muted/30" : ""}
                                    >
                                        <TableCell>
                                            {payment.payment_date
                                                ? format(parseISO(payment.payment_date), "dd MMM yyyy", { locale: fr })
                                                : "-"}
                                        </TableCell>
                                        <TableCell className="font-mono">{payment.invoices?.invoice_number}</TableCell>
                                        <TableCell>
                                            {payment.invoices?.students?.last_name} {payment.invoices?.students?.first_name}
                                        </TableCell>
                                        <TableCell className={cn(
                                            "font-semibold",
                                            payment.status === 'REVERSED' ? "line-through text-muted-foreground" : "text-green-600"
                                        )}>
                                            {formatCurrency(Number(payment.amount))}
                                        </TableCell>
                                        <TableCell className="capitalize">
                                            {payment.payment_method === "cash" ? "Espèces" :
                                                payment.payment_method === "bank_transfer" ? "Virement" :
                                                    payment.payment_method === "mobile_money" ? "Mobile Money" :
                                                        payment.payment_method === "check" ? "Chèque" : payment.payment_method || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={payment.status === 'REVERSED' ? "destructive" : "secondary"}>
                                                {payment.status === 'REVERSED' ? "Annulé" : "Validé"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {payment.status === 'VALID' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleReverse(payment.id)}
                                                    title="Annuler le paiement"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                </Button>
                                            )}
                                            {payment.status === 'REVERSED' && (
                                                <AlertTriangle className="w-4 h-4 text-muted-foreground ml-auto" title="Action annulée" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            {/* Pagination Controls */}
            {totalItems > 0 && (
                <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Afficher</span>
                        <Select
                            value={pageSize.toString()}
                            onValueChange={(v) => {
                                setPageSize(parseInt(v));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                        </Select>
                        <span>par page</span>
                        <span className="ml-4">
                            {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalItems)} sur {totalItems}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            Précédent
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                .map((p, i, arr) => (
                                    <div key={p} className="flex items-center gap-1">
                                        {i > 0 && arr[i - 1] !== p - 1 && <span className="text-muted-foreground">...</span>}
                                        <Button
                                            variant={currentPage === p ? "default" : "outline"}
                                            size="sm"
                                            className="w-8 h-8 p-0"
                                            onClick={() => setCurrentPage(p)}
                                        >
                                            {p}
                                        </Button>
                                    </div>
                                ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                        >
                            Suivant
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
};

