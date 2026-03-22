import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    BookOpen,
    Eye,
    CheckCircle,
    XCircle,
    UserPlus
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AdmissionApplication, AdmissionStatus } from "@/queries/admissions";
import { Skeleton } from "@/components/ui/skeleton";

interface AdmissionTableProps {
    applications: AdmissionApplication[];
    isLoading: boolean;
    studentLabel: string;
    onUpdateStatus: (id: string, status: AdmissionStatus, application: AdmissionApplication) => void;
}

const statusConfig: Record<AdmissionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    DRAFT: { label: "Brouillon", variant: "outline" },
    SUBMITTED: { label: "Soumis", variant: "secondary" },
    UNDER_REVIEW: { label: "En cours", variant: "default" },
    ACCEPTED: { label: "Accepté", variant: "default" },
    REJECTED: { label: "Refusé", variant: "destructive" },
    CONVERTED_TO_STUDENT: { label: "Inscrit", variant: "default" },
};

export const AdmissionTable = ({
    applications,
    isLoading,
    studentLabel,
    onUpdateStatus
}: AdmissionTableProps) => {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: applications.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 73,
        overscan: 10,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
        : 0;

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-[250px]" />
                            <Skeleton className="h-4 w-[200px]" />
                        </div>
                        <Skeleton className="h-8 w-24" />
                    </div>
                ))}
            </div>
        );
    }

    if (applications.length === 0) {
        return (
            <div className="text-center py-12">
                <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Aucune candidature trouvée</p>
                <p className="text-sm text-muted-foreground/70">
                    Les candidatures soumises apparaîtront ici
                </p>
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className="h-[600px] overflow-auto border rounded-md relative"
        >
            <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                    <TableRow>
                        <TableHead>{studentLabel}</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paddingTop > 0 && (
                        <TableRow>
                            <TableCell colSpan={5} style={{ height: `${paddingTop}px` }} />
                        </TableRow>
                    )}
                    {virtualItems.map((virtualRow) => {
                        const app = applications[virtualRow.index];
                        return (
                            <TableRow key={app.id} style={{ height: `${virtualRow.size}px` }}>
                                <TableCell>
                                    <div>
                                        <p className="font-medium">
                                            {app.student_first_name} {app.student_last_name}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {app.student_date_of_birth && format(new Date(app.student_date_of_birth), "dd MMM yyyy", { locale: fr })}
                                        </p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div>
                                        <p className="font-medium">
                                            {app.parent_first_name} {app.parent_last_name}
                                        </p>
                                        <p className="text-sm text-muted-foreground">{app.parent_email}</p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {app.submitted_at
                                        ? format(new Date(app.submitted_at), "dd MMM yyyy", { locale: fr })
                                        : format(new Date(app.created_at!), "dd MMM yyyy", { locale: fr })
                                    }
                                </TableCell>
                                <TableCell>
                                    <Badge variant={statusConfig[app.status as AdmissionStatus]?.variant || "outline"}>
                                        {statusConfig[app.status as AdmissionStatus]?.label || app.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {app.status === "SUBMITTED" && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => onUpdateStatus(app.id, "UNDER_REVIEW", app)}
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                        )}
                                        {app.status === "UNDER_REVIEW" && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    onClick={() => onUpdateStatus(app.id, "ACCEPTED", app)}
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => onUpdateStatus(app.id, "REJECTED", app)}
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </Button>
                                            </>
                                        )}
                                        {app.status === "ACCEPTED" && (
                                            <Button
                                                size="sm"
                                                variant="default"
                                                onClick={() => onUpdateStatus(app.id, "CONVERTED_TO_STUDENT", app)}
                                            >
                                                <UserPlus className="w-4 h-4 mr-1" />
                                                Inscrire
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {paddingBottom > 0 && (
                        <TableRow>
                            <TableCell colSpan={5} style={{ height: `${paddingBottom}px` }} />
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

