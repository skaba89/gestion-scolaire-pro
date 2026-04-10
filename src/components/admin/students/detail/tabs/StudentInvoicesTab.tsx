import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/useCurrency";

interface Invoice {
    id: string;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    status: string;
    due_date: string | null;
}

interface StudentInvoicesTabProps {
    invoices: Invoice[];
}

export function StudentInvoicesTab({ invoices }: StudentInvoicesTabProps) {
    const { formatCurrency } = useCurrency();
    const getPaymentStatusBadge = (status: string) => {
        const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
            PAID: "default",
            PARTIAL: "secondary",
            PENDING: "outline",
            OVERDUE: "destructive",
        };
        const labels: Record<string, string> = {
            PAID: "Payé",
            PARTIAL: "Partiel",
            PENDING: "En attente",
            OVERDUE: "En retard",
        };
        return <Badge variant={variants[status] || "outline"}>{labels[status] || status}</Badge>;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Historique Financier</CardTitle>
                <CardDescription>Factures et paiements</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>N° Facture</TableHead>
                            <TableHead>Montant</TableHead>
                            <TableHead>Payé</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead>Échéance</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                    Aucune facture
                                </TableCell>
                            </TableRow>
                        ) : (
                            invoices.map((invoice) => (
                                <TableRow key={invoice.id}>
                                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                                    <TableCell>{formatCurrency(invoice.total_amount)}</TableCell>
                                    <TableCell>{formatCurrency(invoice.paid_amount || 0)}</TableCell>
                                    <TableCell>{getPaymentStatusBadge(invoice.status)}</TableCell>
                                    <TableCell>
                                        {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("fr-FR") : "-"}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
