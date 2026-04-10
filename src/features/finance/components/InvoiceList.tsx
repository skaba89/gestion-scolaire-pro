import { useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCurrency } from "@/hooks/useCurrency";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Search, Plus, CreditCard, Receipt, Pencil, Trash2, CalendarDays, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Invoice, PaymentStatus } from "../types";
import { InvoiceActions } from "@/components/invoices/InvoiceActions";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { exportToCSV } from "@/utils/exportUtils";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";

interface InvoiceListProps {
    invoices: Invoice[];
    totalCount: number;
    isLoading: boolean;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onNewInvoice: () => void;
    onEditInvoice: (invoice: Invoice) => void;
    onDeleteInvoice: (invoice: Invoice) => void;
    onRegisterPayment: (invoice: Invoice) => void;
}

const statusConfig: Record<PaymentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    PENDING: { label: "En attente", variant: "outline" },
    PARTIAL: { label: "Partiel", variant: "secondary" },
    PAID: { label: "Payé", variant: "default" },
    OVERDUE: { label: "En retard", variant: "destructive" },
    CANCELLED: { label: "Annulé", variant: "outline" },
};

export const InvoiceList = ({
    invoices,
    totalCount,
    isLoading,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onNewInvoice,
    onEditInvoice,
    onDeleteInvoice,
    onRegisterPayment,
}: InvoiceListProps) => {
    const { formatCurrency } = useCurrency();
    const { studentLabel } = useStudentLabel();
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Note: With server-side pagination, sorting and filtering should ideally happen on the server.
    // However, the current hook doesn't support it yet. We'll show the paginated data directly.
    const displayInvoices = invoices;
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: displayInvoices.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 73,
        overscan: 10,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
        : 0;

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder={`Rechercher par numéro ou ${studentLabel.toLowerCase()}...`}
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    onPageChange(1);
                                }}
                                className="pl-10"
                            />
                        </div>
                        <Select
                            value={statusFilter}
                            onValueChange={(v) => {
                                setStatusFilter(v);
                                onPageChange(1);
                            }}
                        >
                            <SelectTrigger className="w-full sm:w-48">
                                <SelectValue placeholder="Tous les statuts" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les statuts</SelectItem>
                                <SelectItem value="PENDING">En attente</SelectItem>
                                <SelectItem value="PARTIAL">Partiel</SelectItem>
                                <SelectItem value="PAID">Payé</SelectItem>
                                <SelectItem value="OVERDUE">En retard</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button variant="outline" onClick={() => {
                                const count = exportToCSV(
                                    invoices.map(inv => ({
                                        numero: inv.invoice_number,
                                        [studentLabel.toLowerCase()]: `${inv.students?.first_name} ${inv.students?.last_name}`,
                                        matricule: inv.students?.registration_number,
                                        montant: inv.total_amount,
                                        paye: inv.paid_amount || 0,
                                        statut: inv.status,
                                        date_echeance: inv.due_date
                                    })),
                                    "factures"
                                );
                                toast.success(`${count} factures exportées`);
                            }}
                                disabled={invoices.length === 0}
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                            <Button onClick={onNewInvoice}>
                                <Plus className="w-4 h-4 mr-2" />
                                Nouvelle Facture
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        Factures ({totalCount})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <TableSkeleton columns={7} rows={8} />
                    ) : displayInvoices.length === 0 ? (
                        <EmptyState
                            icon={CreditCard}
                            title="Aucune facture trouvée"
                            description="Créez une nouvelle facture pour commencer à suivre les paiements."
                            actionLabel="Nouvelle Facture"
                            onAction={onNewInvoice}
                        />
                    ) : (
                        <div
                            ref={parentRef}
                            className="h-[600px] overflow-auto border rounded-md relative"
                        >
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                                    <TableRow>
                                        <TableHead>N° Facture</TableHead>
                                        <TableHead>{studentLabel}</TableHead>
                                        <TableHead>Montant</TableHead>
                                        <TableHead>Payé</TableHead>
                                        <TableHead>Échéance</TableHead>
                                        <TableHead>Statut</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paddingTop > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} style={{ height: `${paddingTop}px` }} />
                                        </TableRow>
                                    )}
                                    {virtualItems.map((virtualRow) => {
                                        const invoice = displayInvoices[virtualRow.index];
                                        const student = invoice.students;
                                        return (
                                            <TableRow key={invoice.id} style={{ height: `${virtualRow.size}px` }}>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        <Badge variant="outline" className="w-fit">{invoice.invoice_number}</Badge>
                                                        {invoice.has_payment_plan && (
                                                            <Badge variant="secondary" className="text-[10px] w-fit font-normal">
                                                                <CalendarDays className="w-3 h-3 mr-1" />
                                                                {invoice.installments_count} écheances
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <p className="font-medium">
                                                        {student?.first_name} {student?.last_name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {student?.registration_number}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {formatCurrency(Number(invoice.total_amount))}
                                                </TableCell>
                                                <TableCell className="text-green-600">
                                                    {formatCurrency(Number(invoice.paid_amount || 0))}
                                                </TableCell>
                                                <TableCell>
                                                    {invoice.due_date
                                                        ? format(parseISO(invoice.due_date), "dd MMM yyyy", { locale: fr })
                                                        : "-"
                                                    }
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={statusConfig[invoice.status as PaymentStatus]?.variant || "outline"}>
                                                        {statusConfig[invoice.status as PaymentStatus]?.label || invoice.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        {invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => onRegisterPayment(invoice)}
                                                                title="Enregistrer paiement"
                                                            >
                                                                <Receipt className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                        <InvoiceActions invoice={invoice} compact />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => onEditInvoice(invoice)}
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => onDeleteInvoice(invoice)}
                                                        >
                                                            <Trash2 className="w-4 h-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {paddingBottom > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} style={{ height: `${paddingBottom}px` }} />
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination Controls */}
            {totalCount > 0 && (
                <DataTablePagination
                    currentPage={currentPage}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={onPageChange}
                    onPageSizeChange={onPageSizeChange}
                />
            )}
        </div>
    );
};
