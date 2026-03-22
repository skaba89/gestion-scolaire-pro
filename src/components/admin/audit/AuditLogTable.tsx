import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { History } from "lucide-react";


interface AuditLog {
    id: string;
    action: string;
    entity_type: string | null;
    severity: "INFO" | "WARNING" | "CRITICAL";
    created_at: string | null;
    user_name?: string;
    user_email?: string;
    new_values: any;
}

interface AuditLogTableProps {
    logs: AuditLog[];
    isLoading: boolean;
    getActionInfo: (action: string) => { label: string; icon: any; color: string };
    tableLabels: Record<string, string>;
    severityColors: Record<string, string>;
}

export const AuditLogTable = ({
    logs,
    isLoading,
    getActionInfo,
    tableLabels,
    severityColors
}: AuditLogTableProps) => {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: logs.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64, // Hauteur moyenne d'une ligne
        overscan: 5,
    });

    if (isLoading) {
        return <TableSkeleton columns={6} rows={10} />;
    }

    if (logs.length === 0) {
        return (
            <EmptyState
                icon={History}
                title="Aucun historique"
                description="Aucune action n'a été enregistrée pour les filtres sélectionnés."
            />
        );
    }


    const { getVirtualItems, getTotalSize } = rowVirtualizer;

    return (
        <div
            ref={parentRef}
            className="rounded-md border h-[600px] overflow-auto relative"
        >
            <Table>
                <TableHeader className="sticky top-0 bg-background z-20 shadow-sm">
                    <TableRow>
                        <TableHead className="w-[150px] bg-background">Date</TableHead>
                        <TableHead className="w-[200px] bg-background">Utilisateur</TableHead>
                        <TableHead className="w-[120px] bg-background">Action</TableHead>
                        <TableHead className="w-[100px] bg-background">Niveau</TableHead>
                        <TableHead className="w-[150px] bg-background">Table</TableHead>
                        <TableHead className="bg-background">Détails</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody style={{ height: `${getTotalSize()}px`, position: 'relative' }}>
                    {getVirtualItems().map((virtualRow) => {
                        const log = logs[virtualRow.index];
                        const actionInfo = getActionInfo(log.action);
                        const ActionIcon = actionInfo.icon;

                        return (
                            <TableRow
                                key={log.id}
                                className="hover:bg-muted/30 transition-colors absolute w-full left-0"
                                style={{
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <TableCell className="text-sm whitespace-nowrap">
                                    {log.created_at
                                        ? format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: fr })
                                        : "—"}
                                </TableCell>
                                <TableCell>
                                    <div>
                                        <p className="font-medium text-sm">
                                            {log.user_name || "—"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {log.user_email || "Système"}
                                        </p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge className={cn(actionInfo.color, "text-white gap-1")}>
                                        <ActionIcon className="w-3 h-3" />
                                        {actionInfo.label}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={cn("px-2 py-0.5 text-[10px] font-bold border", severityColors[log.severity || "INFO"])}
                                    >
                                        {log.severity || "INFO"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {log.entity_type ? (
                                        <Badge variant="outline" className="font-normal">
                                            {tableLabels[log.entity_type] || log.entity_type}
                                        </Badge>
                                    ) : (
                                        "—"
                                    )}
                                </TableCell>
                                <TableCell className="max-w-xs">
                                    {log.new_values ? (
                                        <p className="text-xs text-muted-foreground truncate italic">
                                            {JSON.stringify(log.new_values).slice(0, 80)}...
                                        </p>
                                    ) : (
                                        "—"
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
};
