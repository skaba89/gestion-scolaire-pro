import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { Check, X, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeaveRequest, LEAVE_TYPE_LABELS, LEAVE_STATUS_COLORS } from "@/types/humanResources";

interface LeavesTableProps {
    leaveRequests: LeaveRequest[];
    onStatusUpdate: (id: string, status: "APPROVED" | "REJECTED") => void;
    onDelete: (leave: LeaveRequest) => void;
}

export function LeavesTable({ leaveRequests, onStatusUpdate, onDelete }: LeavesTableProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: leaveRequests.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 53,
        overscan: 5,
    });

    if (leaveRequests.length === 0) {
        return <p className="text-center text-muted-foreground py-8">Aucune demande de congé</p>;
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
                        <TableHead>Employé</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Période</TableHead>
                        <TableHead>Durée</TableHead>
                        <TableHead>Statut</TableHead>
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
                        const request = leaveRequests[virtualRow.index];
                        return (
                            <TableRow key={request.id} style={{ height: `${virtualRow.size}px` }}>
                                <TableCell className="font-medium">{request.employee?.first_name} {request.employee?.last_name}</TableCell>
                                <TableCell>{LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}</TableCell>
                                <TableCell>
                                    {format(new Date(request.start_date), "dd/MM/yyyy")} au {format(new Date(request.end_date), "dd/MM/yyyy")}
                                </TableCell>
                                <TableCell>{request.total_days} jours</TableCell>
                                <TableCell>
                                    <Badge className={LEAVE_STATUS_COLORS[request.status] || "bg-gray-100 text-gray-800"}>
                                        {request.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        {request.status === "PENDING" && (
                                            <>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                    onClick={() => onStatusUpdate(request.id, "APPROVED")}
                                                    aria-label="Approuver"
                                                >
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => onStatusUpdate(request.id, "REJECTED")}
                                                    aria-label="Rejeter"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </>
                                        )}
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => onDelete(request)}
                                            aria-label="Supprimer"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
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
