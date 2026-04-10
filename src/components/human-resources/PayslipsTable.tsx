import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Payslip } from "@/types/humanResources";
import { PayslipActions } from "./PayslipActions";

interface PayslipsTableProps {
    payslips: Payslip[];
    currency: string;
    months: string[];
    onEdit: (payslip: Payslip) => void;
    onDelete: (payslip: Payslip) => void;
}

export function PayslipsTable({ payslips, currency, months, onEdit, onDelete }: PayslipsTableProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: payslips.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 53,
        overscan: 5,
    });

    if (payslips.length === 0) {
        return <p className="text-center text-muted-foreground py-8">Aucun bulletin de paie trouvé</p>;
    }

    const virtualItems = rowVirtualizer.getVirtualItems();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
        : 0;

    return (
        <div
            ref={parentRef}
            className="rounded-md border h-[500px] overflow-auto relative"
        >
            <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                        <TableHead>Période</TableHead>
                        <TableHead>Employé</TableHead>
                        <TableHead>Salaire Brut</TableHead>
                        <TableHead>Net à Payer</TableHead>
                        <TableHead>Date paiement</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paddingTop > 0 && (
                        <TableRow>
                            <TableCell colSpan={6} style={{ height: `${paddingTop}px` }} />
                        </TableRow>
                    )}
                    {virtualItems.map((virtualRow) => {
                        const payslip = payslips[virtualRow.index];
                        return (
                            <TableRow key={payslip.id} style={{ height: `${virtualRow.size}px` }}>
                                <TableCell className="font-medium">
                                    {months[payslip.period_month - 1]} {payslip.period_year}
                                </TableCell>
                                <TableCell>{payslip.employee?.first_name} {payslip.employee?.last_name}</TableCell>
                                <TableCell>{payslip.gross_salary.toLocaleString("fr-FR")} {currency}</TableCell>
                                <TableCell className="font-bold">{payslip.net_salary.toLocaleString("fr-FR")} {currency}</TableCell>
                                <TableCell>{payslip.pay_date ? format(new Date(payslip.pay_date), "dd/MM/yyyy") : "-"}</TableCell>
                                <TableCell className="text-right">
                                    <PayslipActions
                                        payslip={payslip}
                                        onEdit={onEdit}
                                        onDelete={onDelete}
                                    />
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {paddingBottom > 0 && (
                        <TableRow>
                            <TableCell colSpan={6} style={{ height: `${paddingBottom}px` }} />
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
